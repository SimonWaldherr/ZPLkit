// Optional direct-print backend for ZPL-Studio.
//
// The editor's browser client already defines a small backend contract in
// backend-client.js. This file implements the Zebra part of that contract
// for the embedded Go server.  Its configuration format deliberately remains
// based on a compact semicolon- (or comma-) separated printer CSV with the
// columns
//
//	mndt;name;ip;port;info;dpi;peel
//
// Only the registry, a bounded raw-TCP send, and the XML print envelope are
// carried forward.  In particular, a request can select only an opaque
// printer ID from that registry; it can never supply a host or port itself.
package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	maxZPLBytes          = 5 << 20  // 5 MiB, matching the template API limit.
	maxPrintRequestBytes = 11 << 20 // JSON/XML envelope plus a 5 MiB ZPL payload.
	maxPrintCopies       = 99
	backendAPIVersion    = 1
)

var errPrinterBusy = errors.New("printer is busy; wait for the active job to finish")

// printer describes one allow-listed Zebra target. Host and Port are never
// included in API responses, so the browser cannot turn this endpoint into an
// arbitrary TCP proxy.
type printer struct {
	ID          string
	Name        string
	DisplayName string
	Host        string
	Port        string
	Info        string
	DPI         int
	Peel        bool
	Default     bool
}

type printerRegistry struct {
	byID       map[string]printer
	ordered    []printer
	defaultID  string
	configPath string
}

type publicPrinter struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	// Printhead resolution from the registry's optional dpi column, so the
	// editor can warn when a label's dot values were laid out for a
	// different resolution than the printer it is about to be sent to (a
	// 203 dpi label prints at two thirds its intended size on a 300 dpi
	// head). Omitted when the registry does not state one - the client
	// treats a missing dpi as "unknown", never as a default.
	DPI     int  `json:"dpi,omitempty"`
	Default bool `json:"default,omitempty"`
}

// loadPrinterRegistry reads the printer CSV. The optional legacy
// mndt, dpi and peel columns are accepted for compatibility; only name/id,
// ip/host and port are required to route a raw ZPL job. An optional `id`
// column supplies a stable API ID distinct from the human-facing `name`, and
// an optional `default` column selects the server default.
func loadPrinterRegistry(path string) (*printerRegistry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read printer registry %q: %w", path, err)
	}

	r := csv.NewReader(bytes.NewReader(data))
	r.Comma = detectCSVDelimiter(data)
	r.TrimLeadingSpace = true
	r.FieldsPerRecord = -1

	header, err := nextCSVRecord(r)
	if err != nil {
		if errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("printer registry %q is empty", path)
		}
		return nil, fmt.Errorf("read printer registry header: %w", err)
	}
	columns, err := csvColumns(header)
	if err != nil {
		return nil, fmt.Errorf("printer registry %q: %w", path, err)
	}

	nameIndex, ok := columns["name"]
	if !ok {
		return nil, fmt.Errorf("printer registry %q needs a name column", path)
	}
	hostIndex, ok := columns["ip"]
	if !ok {
		hostIndex, ok = columns["host"]
	}
	if !ok {
		return nil, fmt.Errorf("printer registry %q needs an ip (or host) column", path)
	}
	portIndex, ok := columns["port"]
	if !ok {
		return nil, fmt.Errorf("printer registry %q needs a port column", path)
	}

	registry := &printerRegistry{
		byID:       make(map[string]printer),
		configPath: path,
	}
	line := 1
	for {
		row, err := nextCSVRecord(r)
		if errors.Is(err, io.EOF) {
			break
		}
		line++
		if err != nil {
			return nil, fmt.Errorf("read printer registry %q line %d: %w", path, line, err)
		}
		if isBlankCSVRecord(row) {
			continue
		}

		value := func(column string) string {
			i, found := columns[column]
			if !found || i >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[i])
		}

		name := strings.TrimSpace(valueAt(row, nameIndex))
		id := value("id")
		if id == "" {
			id = name
		}
		host := strings.TrimSpace(valueAt(row, hostIndex))
		port := strings.TrimSpace(valueAt(row, portIndex))
		if err := validatePrinterID(id); err != nil {
			return nil, fmt.Errorf("printer registry %q line %d: invalid printer id: %w", path, line, err)
		}
		if name == "" {
			return nil, fmt.Errorf("printer registry %q line %d: printer name is empty", path, line)
		}
		if !validPrinterHost(host) {
			return nil, fmt.Errorf("printer registry %q line %d: invalid printer host %q", path, line, host)
		}
		if err := validatePrinterPort(port); err != nil {
			return nil, fmt.Errorf("printer registry %q line %d: %w", path, line, err)
		}
		if _, exists := registry.byID[id]; exists {
			return nil, fmt.Errorf("printer registry %q line %d: duplicate printer id %q", path, line, id)
		}

		dpi, err := parseOptionalPositiveInt(value("dpi"))
		if err != nil {
			return nil, fmt.Errorf("printer registry %q line %d: invalid dpi: %w", path, line, err)
		}
		peel, err := parseOptionalBool(value("peel"))
		if err != nil {
			return nil, fmt.Errorf("printer registry %q line %d: invalid peel value: %w", path, line, err)
		}
		isDefault, err := parseOptionalBool(value("default"))
		if err != nil {
			return nil, fmt.Errorf("printer registry %q line %d: invalid default value: %w", path, line, err)
		}
		if isDefault && registry.defaultID != "" {
			return nil, fmt.Errorf("printer registry %q line %d: more than one default printer", path, line)
		}

		info := value("info")
		displayName := name
		if info != "" && info != name {
			displayName = info + " (" + name + ")"
		}
		p := printer{
			ID:          id,
			Name:        name,
			DisplayName: displayName,
			Host:        host,
			Port:        port,
			Info:        info,
			DPI:         dpi,
			Peel:        peel,
			Default:     isDefault,
		}
		registry.byID[id] = p
		registry.ordered = append(registry.ordered, p)
		if isDefault {
			registry.defaultID = id
		}
	}

	if len(registry.ordered) == 0 {
		return nil, fmt.Errorf("printer registry %q contains no printers", path)
	}
	if registry.defaultID == "" && len(registry.ordered) == 1 {
		registry.defaultID = registry.ordered[0].ID
		p := registry.byID[registry.defaultID]
		p.Default = true
		registry.byID[p.ID] = p
		registry.ordered[0] = p
	}
	sort.Slice(registry.ordered, func(i, j int) bool {
		if registry.ordered[i].DisplayName == registry.ordered[j].DisplayName {
			return registry.ordered[i].ID < registry.ordered[j].ID
		}
		return registry.ordered[i].DisplayName < registry.ordered[j].DisplayName
	})
	return registry, nil
}

func detectCSVDelimiter(data []byte) rune {
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(line, "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.Count(line, ";") > strings.Count(line, ",") {
			return ';'
		}
		break
	}
	return ','
}

func nextCSVRecord(r *csv.Reader) ([]string, error) {
	for {
		record, err := r.Read()
		if err != nil {
			return nil, err
		}
		if isBlankCSVRecord(record) || (len(record) > 0 && strings.HasPrefix(strings.TrimSpace(record[0]), "#")) {
			continue
		}
		return record, nil
	}
}

func isBlankCSVRecord(record []string) bool {
	for _, value := range record {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func csvColumns(header []string) (map[string]int, error) {
	columns := make(map[string]int, len(header))
	for i, value := range header {
		name := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(value, "\ufeff")))
		if name == "" {
			continue
		}
		if _, exists := columns[name]; exists {
			return nil, fmt.Errorf("duplicate column %q", name)
		}
		columns[name] = i
	}
	return columns, nil
}

func valueAt(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	return row[index]
}

func validatePrinterID(id string) error {
	if id == "" {
		return errors.New("empty")
	}
	if len(id) > 128 || !utf8.ValidString(id) {
		return errors.New("must be valid UTF-8 and at most 128 bytes")
	}
	if strings.TrimSpace(id) != id {
		return errors.New("must not start or end with whitespace")
	}
	for _, r := range id {
		if unicode.IsControl(r) {
			return errors.New("must not contain control characters")
		}
	}
	return nil
}

func validPrinterHost(host string) bool {
	if host == "" || len(host) > 253 || strings.TrimSpace(host) != host {
		return false
	}
	// This is a configuration file, not request input, but rejecting URL/path
	// syntax makes accidentally pasting a URL or an IPv6 address with brackets
	// fail at startup rather than produce a surprising network destination.
	if strings.ContainsAny(host, " \t\r\n/\\?#@[]") {
		return false
	}
	if net.ParseIP(host) != nil {
		return true
	}
	// A colon that was not accepted as an IP literal would be ambiguous when
	// joined with the configured port below. Limit names to ordinary DNS host
	// labels instead of accepting an accidental "host:port" entry.
	if strings.Contains(host, ":") {
		return false
	}
	for _, label := range strings.Split(strings.TrimSuffix(host, "."), ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, r := range label {
			if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-') {
				return false
			}
		}
	}
	return true
}

func validatePrinterPort(port string) error {
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return fmt.Errorf("invalid printer port %q", port)
	}
	return nil
}

func parseOptionalPositiveInt(value string) (int, error) {
	if value == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("expected a positive integer")
	}
	return n, nil
}

func parseOptionalBool(value string) (bool, error) {
	if value == "" {
		return false, nil
	}
	switch strings.ToLower(value) {
	case "1", "true", "t", "yes", "y", "ja", "j", "on":
		return true, nil
	case "0", "false", "f", "no", "n", "nein", "off":
		return false, nil
	default:
		return false, fmt.Errorf("expected true/false")
	}
}

func (r *printerRegistry) publicList() []publicPrinter {
	if r == nil {
		return []publicPrinter{}
	}
	result := make([]publicPrinter, 0, len(r.ordered))
	for _, p := range r.ordered {
		result = append(result, publicPrinter{
			ID:      p.ID,
			Name:    p.DisplayName,
			Type:    "zebra",
			DPI:     p.DPI,
			Default: p.ID == r.defaultID,
		})
	}
	return result
}

// printBackend owns immutable printer configuration and one non-queuing gate
// per printer. Zebra devices receive a raw byte stream, so serialising writes
// for a given device prevents simultaneous browser requests from interleaving
// labels. A busy printer returns a clear 429 instead of accumulating an
// unbounded, invisible queue of physical print jobs.
type printBackend struct {
	registry     *printerRegistry
	gates        map[string]chan struct{}
	dialTimeout  time.Duration
	writeTimeout time.Duration
	retries      int
	sequence     atomic.Uint64
}

func newPrintBackend(registry *printerRegistry, defaultPrinterID string, dialTimeout, writeTimeout time.Duration, retries int) (*printBackend, error) {
	if registry == nil {
		return nil, nil
	}
	if dialTimeout <= 0 || writeTimeout <= 0 {
		return nil, errors.New("printer dial and write timeouts must be positive")
	}
	if retries < 0 || retries > 10 {
		return nil, errors.New("printer retry count must be between 0 and 10")
	}
	if defaultPrinterID != "" {
		if _, exists := registry.byID[defaultPrinterID]; !exists {
			return nil, fmt.Errorf("configured default printer %q is not in %s", defaultPrinterID, registry.configPath)
		}
		registry.defaultID = defaultPrinterID
	}

	gates := make(map[string]chan struct{}, len(registry.byID))
	for id := range registry.byID {
		gates[id] = make(chan struct{}, 1)
	}
	return &printBackend{
		registry:     registry,
		gates:        gates,
		dialTimeout:  dialTimeout,
		writeTimeout: writeTimeout,
		retries:      retries,
	}, nil
}

func (b *printBackend) enabled() bool {
	return b != nil && b.registry != nil && len(b.registry.byID) > 0
}

func (b *printBackend) capabilities() []string {
	if !b.enabled() {
		return []string{}
	}
	return []string{"printers.list", "print.zebra", "labelserver.xml"}
}

type printTarget struct {
	Type      string            `json:"type"`
	PrinterID optionalPrinterID `json:"printerId"`
}

type printRequest struct {
	Target   printTarget    `json:"target"`
	ZPL      string         `json:"zpl"`
	Copies   optionalCopies `json:"copies"`
	Document any            `json:"document,omitempty"`
}

// optionalPrinterID accepts a missing or null printerId as an intentional
// request for the configured default. A supplied ID, however, is validated
// strictly so an empty/whitespace value cannot silently send a job elsewhere.
type optionalPrinterID struct {
	Value   string
	Present bool
}

func (id *optionalPrinterID) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) {
		return nil
	}
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return errors.New("printerId must be a string or null")
	}
	if err := validatePrinterID(value); err != nil {
		return fmt.Errorf("printerId %w", err)
	}
	id.Value = value
	id.Present = true
	return nil
}

// optionalCopies defaults only when the field is absent. Explicit zero, null
// or a non-number are invalid: treating them as one label could turn a client
// mistake into a physical print job.
type optionalCopies struct {
	Value   int
	Present bool
}

func (copies *optionalCopies) UnmarshalJSON(data []byte) error {
	copies.Present = true
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) {
		return errors.New("copies must be a number")
	}
	if err := json.Unmarshal(data, &copies.Value); err != nil {
		return errors.New("copies must be a number")
	}
	return nil
}

func (copies *optionalCopies) UnmarshalXML(decoder *xml.Decoder, start xml.StartElement) error {
	copies.Present = true
	var raw string
	if err := decoder.DecodeElement(&raw, &start); err != nil {
		return err
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return errors.New("Copies must be a number")
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return errors.New("Copies must be a number")
	}
	copies.Value = value
	return nil
}

func (b *printBackend) validatePrintRequest(req printRequest) (printer, []byte, int, error) {
	if !b.enabled() {
		return printer{}, nil, 0, errors.New("print backend is not configured")
	}
	if req.Target.Type != "zebra" {
		return printer{}, nil, 0, fmt.Errorf("unsupported print target type %q", req.Target.Type)
	}
	if strings.TrimSpace(req.ZPL) == "" {
		return printer{}, nil, 0, errors.New("zpl must not be empty")
	}
	payload := []byte(req.ZPL)
	if len(payload) > maxZPLBytes {
		return printer{}, nil, 0, fmt.Errorf("zpl exceeds the %d byte limit", maxZPLBytes)
	}
	copies := 1
	if req.Copies.Present {
		copies = req.Copies.Value
	}
	if copies < 1 || copies > maxPrintCopies {
		return printer{}, nil, 0, fmt.Errorf("copies must be between 1 and %d", maxPrintCopies)
	}

	printerID := b.registry.defaultID
	if req.Target.PrinterID.Present {
		printerID = req.Target.PrinterID.Value
	}
	if printerID == "" {
		return printer{}, nil, 0, errors.New("printerId is required because no default printer is configured")
	}
	p, exists := b.registry.byID[printerID]
	if !exists {
		return printer{}, nil, 0, fmt.Errorf("unknown printerId %q", printerID)
	}
	return p, payload, copies, nil
}

func (b *printBackend) submit(ctx context.Context, req printRequest) (string, error) {
	p, payload, copies, err := b.validatePrintRequest(req)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	gate := b.gates[p.ID]
	select {
	case gate <- struct{}{}:
		defer func() { <-gate }()
	default:
		return "", errPrinterBusy
	}
	if err := b.sendZPL(ctx, p, payload, copies); err != nil {
		return "", err
	}
	jobID := fmt.Sprintf("zpl-%d-%06d", time.Now().UTC().UnixMilli(), b.sequence.Add(1))
	log.Printf("Druckauftrag %s an %q gesendet (%d Kopie(n), %d ZPL-Bytes)", jobID, p.Name, copies, len(payload))
	return jobID, nil
}

// sendZPL retries only failures where no payload bytes reached a connection.
// Retrying a partial write can duplicate labels at a printer, so it is
// deliberately reported as an uncertain delivery instead of being repeated.
func (b *printBackend) sendZPL(ctx context.Context, p printer, payload []byte, copies int) error {
	address := net.JoinHostPort(p.Host, p.Port)
	attempts := b.retries + 1
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		dialer := net.Dialer{Timeout: b.dialTimeout}
		conn, err := dialer.DialContext(ctx, "tcp", address)
		if err == nil {
			err = conn.SetWriteDeadline(time.Now().Add(b.writeTimeout))
			if err == nil {
				bytesWritten, writeErr := writeZPLCopies(conn, payload, copies)
				err = writeErr
				if err != nil && bytesWritten > 0 {
					conn.Close()
					return fmt.Errorf("printer accepted part of the job; not retrying to avoid duplicate labels: %w", err)
				}
			}
			conn.Close()
			if err == nil {
				return nil
			}
		}
		lastErr = err
		if attempt == attempts {
			break
		}
		if err := waitForRetry(ctx, 250*time.Millisecond); err != nil {
			return err
		}
	}
	return fmt.Errorf("could not deliver print job after %d attempt(s): %w", attempts, lastErr)
}

func writeZPLCopies(conn net.Conn, payload []byte, copies int) (int, error) {
	bytesWritten := 0
	for copyIndex := 0; copyIndex < copies; copyIndex++ {
		n, err := conn.Write(payload)
		bytesWritten += n
		if err != nil {
			return bytesWritten, err
		}
		if n != len(payload) {
			return bytesWritten, io.ErrShortWrite
		}
	}
	return bytesWritten, nil
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func registerPrintRoutes(mux *http.ServeMux, backend *printBackend) {
	mux.HandleFunc("/api/backend", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		capabilities := backend.capabilities()
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{
			"apiVersion":   backendAPIVersion,
			"capabilities": capabilities,
			"name":         "ZPL-Studio Zebra Backend",
		})
	})
	mux.HandleFunc("/api/printers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w, http.MethodGet)
			return
		}
		if !backend.enabled() {
			writePrintClientError(w, http.StatusServiceUnavailable, "backend_disabled", "print backend is not configured")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{"printers": backend.registry.publicList()})
	})
	mux.HandleFunc("/api/print", func(w http.ResponseWriter, r *http.Request) {
		backend.handlePrint(w, r)
	})
	mux.HandleFunc("/api/labelserver", func(w http.ResponseWriter, r *http.Request) {
		backend.handleLabelServer(w, r)
	})

	if backend.enabled() {
		log.Printf("Zebra-Druck-Backend: %d Drucker aus %s (unter /api/backend)", len(backend.registry.ordered), backend.registry.configPath)
	} else {
		log.Printf("Zebra-Druck-Backend: deaktiviert (mit -printers <datei.csv> aktivieren)")
	}
}

func (b *printBackend) handlePrint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	if !b.enabled() {
		writePrintClientError(w, http.StatusServiceUnavailable, "backend_disabled", "print backend is not configured")
		return
	}
	if !hasContentType(r, "application/json") {
		writePrintClientError(w, http.StatusUnsupportedMediaType, "invalid_request", "Content-Type must be application/json")
		return
	}
	req, err := decodePrintJSON(w, r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writePrintClientError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request too large")
			return
		}
		writePrintClientError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	jobID, err := b.submit(r.Context(), req)
	if err != nil {
		writePrintError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "jobId": jobID})
}

func decodePrintJSON(w http.ResponseWriter, r *http.Request) (printRequest, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxPrintRequestBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req printRequest
	if err := decoder.Decode(&req); err != nil {
		return printRequest{}, fmt.Errorf("invalid print request: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return printRequest{}, errors.New("print request must contain one JSON object")
		}
		return printRequest{}, fmt.Errorf("invalid print request: %w", err)
	}
	return req, nil
}

type xmlPrintJob struct {
	XMLName xml.Name `xml:"PrintJob"`
	Printer struct {
		ID string `xml:"id,attr"`
	} `xml:"Printer"`
	Copies optionalCopies `xml:"Copies"`
	ZPL    string         `xml:"Zpl"`
}

// validatePrintJobEnvelope deliberately accepts only this project's small
// PrintJob vocabulary before unmarshalling it. encoding/xml does not resolve
// external entities, but rejecting every XML directive as well makes the
// no-DTD/XXE policy explicit and avoids string-based checks that could reject
// harmless ZPL text inside a CDATA section.
func validatePrintJobEnvelope(body []byte) error {
	decoder := xml.NewDecoder(bytes.NewReader(body))
	depth := 0
	rootSeen := false
	rootClosed := false
	seen := make(map[string]bool)
	stack := make([]string, 0, 2)

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			if !rootSeen || depth != 0 {
				return errors.New("XML must contain one complete PrintJob document")
			}
			if !seen["Zpl"] {
				return errors.New("PrintJob needs a Zpl element")
			}
			return nil
		}
		if err != nil {
			return err
		}

		switch value := token.(type) {
		case xml.ProcInst:
			if depth != 0 || (value.Target != "xml" && value.Target != "") {
				return errors.New("processing instructions are not allowed")
			}
		case xml.Directive:
			return errors.New("DTD and entity declarations are not allowed")
		case xml.StartElement:
			if rootClosed {
				return errors.New("XML must contain one PrintJob document")
			}
			if value.Name.Space != "" {
				return errors.New("XML namespaces are not allowed in PrintJob")
			}
			switch depth {
			case 0:
				if rootSeen || value.Name.Local != "PrintJob" || len(value.Attr) != 0 {
					return errors.New("XML root must be an attribute-free PrintJob")
				}
				rootSeen = true
			case 1:
				if value.Name.Local != "Printer" && value.Name.Local != "Copies" && value.Name.Local != "Zpl" {
					return fmt.Errorf("unexpected PrintJob element %q", value.Name.Local)
				}
				if seen[value.Name.Local] {
					return fmt.Errorf("PrintJob element %q may appear only once", value.Name.Local)
				}
				if err := validatePrintJobAttributes(value); err != nil {
					return err
				}
				seen[value.Name.Local] = true
			default:
				return errors.New("PrintJob elements must not contain nested XML")
			}
			depth++
			stack = append(stack, value.Name.Local)
		case xml.EndElement:
			if depth == 0 || len(stack) == 0 || stack[len(stack)-1] != value.Name.Local {
				return errors.New("malformed PrintJob XML")
			}
			stack = stack[:len(stack)-1]
			depth--
			if depth == 0 {
				rootClosed = true
			}
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(value)) != "" {
				return errors.New("text outside PrintJob is not allowed")
			}
			if depth == 2 && len(stack) == 2 && stack[1] == "Printer" && strings.TrimSpace(string(value)) != "" {
				return errors.New("Printer may only contain its id attribute")
			}
		}
	}
}

func validatePrintJobAttributes(element xml.StartElement) error {
	if element.Name.Local != "Printer" {
		if len(element.Attr) != 0 {
			return fmt.Errorf("PrintJob element %q must not have attributes", element.Name.Local)
		}
		return nil
	}
	if len(element.Attr) > 1 {
		return errors.New("Printer may only have one id attribute")
	}
	if len(element.Attr) == 1 && (element.Attr[0].Name.Space != "" || element.Attr[0].Name.Local != "id") {
		return errors.New("Printer may only have an id attribute")
	}
	if len(element.Attr) == 1 {
		if err := validatePrinterID(element.Attr[0].Value); err != nil {
			return fmt.Errorf("invalid Printer id: %w", err)
		}
	}
	return nil
}

func (b *printBackend) handleLabelServer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	if !b.enabled() {
		writePrintClientError(w, http.StatusServiceUnavailable, "backend_disabled", "print backend is not configured")
		return
	}
	if !hasContentType(r, "application/xml") {
		writePrintClientError(w, http.StatusUnsupportedMediaType, "invalid_request", "Content-Type must be application/xml")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPrintRequestBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writePrintClientError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request too large or unreadable")
		return
	}
	if err := validatePrintJobEnvelope(body); err != nil {
		writePrintClientError(w, http.StatusBadRequest, "invalid_request", "invalid print-job XML: "+err.Error())
		return
	}

	var job xmlPrintJob
	decoder := xml.NewDecoder(bytes.NewReader(body))
	decoder.Strict = true
	if err := decoder.Decode(&job); err != nil {
		writePrintClientError(w, http.StatusBadRequest, "invalid_request", "invalid print-job XML: "+err.Error())
		return
	}
	if job.XMLName.Local != "PrintJob" {
		writePrintClientError(w, http.StatusBadRequest, "invalid_request", "XML root must be PrintJob")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writePrintClientError(w, http.StatusBadRequest, "invalid_request", "XML must contain one PrintJob document")
		return
	}

	target := printTarget{Type: "zebra"}
	if job.Printer.ID != "" {
		target.PrinterID = optionalPrinterID{Value: job.Printer.ID, Present: true}
	}
	jobID, err := b.submit(r.Context(), printRequest{
		Target: target,
		ZPL:    job.ZPL,
		Copies: job.Copies,
	})
	if err != nil {
		writePrintError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	result := struct {
		XMLName xml.Name `xml:"PrintJobResult"`
		OK      bool     `xml:"ok,attr"`
		JobID   string   `xml:"jobId,attr,omitempty"`
	}{OK: true, JobID: jobID}
	_, _ = w.Write([]byte(xml.Header))
	_ = xml.NewEncoder(w).Encode(result)
}

func hasContentType(r *http.Request, expected string) bool {
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	return contentType == expected || strings.HasPrefix(contentType, expected+";")
}

func writePrintError(w http.ResponseWriter, err error) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		writePrintClientError(w, http.StatusGatewayTimeout, "delivery_timeout", "print delivery timed out")
		return
	}
	if errors.Is(err, errPrinterBusy) {
		w.Header().Set("Retry-After", "1")
		writePrintClientError(w, http.StatusTooManyRequests, "printer_busy", err.Error())
		return
	}
	message := err.Error()
	switch {
	case strings.HasPrefix(message, "unknown printerId"):
		writePrintClientError(w, http.StatusNotFound, "printer_not_found", message)
	case strings.HasPrefix(message, "print backend is not configured"):
		writePrintClientError(w, http.StatusServiceUnavailable, "backend_disabled", message)
	case strings.HasPrefix(message, "unsupported print target"),
		strings.HasPrefix(message, "zpl "),
		strings.HasPrefix(message, "copies "),
		strings.HasPrefix(message, "printerId "):
		writePrintClientError(w, http.StatusBadRequest, "invalid_request", message)
	default:
		log.Printf("Druckauftrag fehlgeschlagen: %v", err)
		code := "delivery_failed"
		if strings.HasPrefix(message, "printer accepted part of the job") {
			code = "delivery_unknown"
		}
		writePrintClientError(w, http.StatusBadGateway, code, "could not deliver print job")
	}
}

// writePrintClientError keeps the documented plain-text error response intact
// for old integrations while giving the editor a stable, localized error
// category. The header is additive and same-origin clients do not need CORS
// exposure to read it.
func writePrintClientError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("ZPL-Error-Code", code)
	http.Error(w, message, status)
}

func methodNotAllowed(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
