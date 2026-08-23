package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadPrinterRegistryAcceptsLegacyColumns(t *testing.T) {
	path := writeTestRegistry(t, "# Legacy-compatible registry\n"+
		"mndt;name;ip;port;info;dpi;peel;default\n"+
		"100;PRN-WA;192.0.2.30;9100;Warenausgang;300;true;true\n"+
		"100;PRN-TEST;127.0.0.1;9100;Test;203;false;false\n")

	registry, err := loadPrinterRegistry(path)
	if err != nil {
		t.Fatalf("loadPrinterRegistry() error = %v", err)
	}
	if got, want := registry.defaultID, "PRN-WA"; got != want {
		t.Fatalf("defaultID = %q, want %q", got, want)
	}
	if got, want := registry.byID["PRN-WA"].DPI, 300; got != want {
		t.Fatalf("DPI = %d, want %d", got, want)
	}
	if !registry.byID["PRN-WA"].Peel {
		t.Fatal("Peel = false, want true")
	}

	publicJSON, err := json.Marshal(registry.publicList())
	if err != nil {
		t.Fatalf("marshal public list: %v", err)
	}
	if strings.Contains(string(publicJSON), "192.0.2.30") || strings.Contains(string(publicJSON), "9100") {
		t.Fatalf("public printer list leaked transport configuration: %s", publicJSON)
	}
	if !strings.Contains(string(publicJSON), `"default":true`) {
		t.Fatalf("public printer list does not mark the default: %s", publicJSON)
	}
}

func TestLoadPrinterRegistryRejectsUnsafeConfiguration(t *testing.T) {
	tests := []struct {
		name string
		csv  string
	}{
		{
			name: "missing host",
			csv:  "name;port\nP1;9100\n",
		},
		{
			name: "invalid port",
			csv:  "name;ip;port\nP1;127.0.0.1;99999\n",
		},
		{
			name: "host must not contain a URL or port",
			csv:  "name;host;port\nP1;http://printer.internal:9100;9100\n",
		},
		{
			name: "duplicate id",
			csv:  "id;name;ip;port\nsame;P1;127.0.0.1;9100\nsame;P2;127.0.0.2;9100\n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := loadPrinterRegistry(writeTestRegistry(t, tt.csv)); err == nil {
				t.Fatal("loadPrinterRegistry() succeeded, want configuration error")
			}
		})
	}
}

func TestPrintAPIForwardsExactZPLCopies(t *testing.T) {
	listener, received := startCapturePrinter(t)
	defer listener.Close()

	backend := backendForListener(t, listener, "test")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	zpl := "^XA^FO20,30^FDHello^FS^XZ"
	body := `{"target":{"type":"zebra","printerId":"test"},"zpl":"` + zpl + `","copies":2}`
	res, err := http.Post(server.URL+"/api/print", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/print: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(res.Body)
		t.Fatalf("POST /api/print status = %d, body = %s", res.StatusCode, data)
	}
	var result struct {
		OK    bool   `json:"ok"`
		JobID string `json:"jobId"`
	}
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		t.Fatalf("decode print response: %v", err)
	}
	if !result.OK || result.JobID == "" {
		t.Fatalf("print response = %#v, want successful job ID", result)
	}

	got := awaitPrinterPayload(t, received)
	if want := zpl + zpl; string(got) != want {
		t.Fatalf("printer payload = %q, want %q", got, want)
	}
}

func TestPrintAPIUsesConfiguredDefaultForNullPrinterID(t *testing.T) {
	listener, received := startCapturePrinter(t)
	defer listener.Close()

	backend := backendForListener(t, listener, "default-printer")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	// BackendClient.printZebra(zpl) deliberately serializes an omitted target
	// as printerId: null. The server must resolve that through its configured
	// default instead of requiring every client to know a printer ID.
	zpl := "^XA^FDdefault printer^FS^XZ"
	body := `{"target":{"type":"zebra","printerId":null},"zpl":"` + zpl + `","copies":1}`
	res, err := http.Post(server.URL+"/api/print", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/print: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(res.Body)
		t.Fatalf("POST /api/print status = %d, body = %s", res.StatusCode, data)
	}
	if got, want := string(awaitPrinterPayload(t, received)), zpl; got != want {
		t.Fatalf("printer payload = %q, want %q", got, want)
	}
}

func TestPrintAPIUsesOneCopyOnlyWhenCopiesIsOmitted(t *testing.T) {
	listener, received := startCapturePrinter(t)
	defer listener.Close()

	backend := backendForListener(t, listener, "default-printer")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	zpl := "^XA^FDdefault copies^FS^XZ"
	body := `{"target":{"type":"zebra","printerId":null},"zpl":"` + zpl + `"}`
	res, err := http.Post(server.URL+"/api/print", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/print: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(res.Body)
		t.Fatalf("POST /api/print status = %d, body = %s", res.StatusCode, data)
	}
	if got, want := string(awaitPrinterPayload(t, received)), zpl; got != want {
		t.Fatalf("printer payload = %q, want %q", got, want)
	}
}

func TestPrintAPIRejectsAmbiguousCopyAndPrinterValues(t *testing.T) {
	backend := backendForPrinter(t, printer{ID: "test", Name: "Test", Host: "127.0.0.1", Port: "9100"}, "test")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	tests := []struct {
		name string
		body string
	}{
		{
			name: "zero copies",
			body: `{"target":{"type":"zebra","printerId":null},"zpl":"^XA^XZ","copies":0}`,
		},
		{
			name: "null copies",
			body: `{"target":{"type":"zebra","printerId":null},"zpl":"^XA^XZ","copies":null}`,
		},
		{
			name: "negative copies",
			body: `{"target":{"type":"zebra","printerId":null},"zpl":"^XA^XZ","copies":-1}`,
		},
		{
			name: "empty printer id",
			body: `{"target":{"type":"zebra","printerId":""},"zpl":"^XA^XZ","copies":1}`,
		},
		{
			name: "whitespace printer id",
			body: `{"target":{"type":"zebra","printerId":"  "},"zpl":"^XA^XZ","copies":1}`,
		},
		{
			name: "transport injection field",
			body: `{"target":{"type":"zebra","printerId":"test","host":"198.51.100.20"},"zpl":"^XA^XZ","copies":1}`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := http.Post(server.URL+"/api/print", "application/json", strings.NewReader(tt.body))
			if err != nil {
				t.Fatalf("POST /api/print: %v", err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				data, _ := io.ReadAll(res.Body)
				t.Fatalf("status = %d, want 400; body = %s", res.StatusCode, data)
			}
		})
	}
}

func TestPrintAPIRejectsAJobWhileThatPrinterIsBusy(t *testing.T) {
	backend := backendForPrinter(t, printer{ID: "test", Name: "Test", Host: "127.0.0.1", Port: "9100"}, "test")
	backend.gates["test"] <- struct{}{}
	defer func() { <-backend.gates["test"] }()
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	body := `{"target":{"type":"zebra","printerId":"test"},"zpl":"^XA^XZ","copies":1}`
	res, err := http.Post(server.URL+"/api/print", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/print: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusTooManyRequests {
		data, _ := io.ReadAll(res.Body)
		t.Fatalf("status = %d, want 429; body = %s", res.StatusCode, data)
	}
	if got := res.Header.Get("Retry-After"); got != "1" {
		t.Fatalf("Retry-After = %q, want 1", got)
	}
	if got := res.Header.Get("ZPL-Error-Code"); got != "printer_busy" {
		t.Fatalf("busy print error code = %q, want printer_busy", got)
	}
}

func TestPrintErrorMarksPartialDeliveryAsUncertain(t *testing.T) {
	res := httptest.NewRecorder()
	writePrintError(res, errors.New("printer accepted part of the job; not retrying to avoid duplicate labels: short write"))
	if res.Code != http.StatusBadGateway {
		t.Fatalf("partial delivery status = %d, want 502", res.Code)
	}
	if got := res.Header().Get("ZPL-Error-Code"); got != "delivery_unknown" {
		t.Fatalf("partial delivery error code = %q, want delivery_unknown", got)
	}
}

func TestPrintAPIReturnsValidationErrorsBeforeDialling(t *testing.T) {
	backend := backendForPrinter(t, printer{ID: "test", Name: "Test", Host: "127.0.0.1", Port: "9100"}, "")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	tests := []struct {
		name string
		body string
		want int
	}{
		{
			name: "unknown printer",
			body: `{"target":{"type":"zebra","printerId":"not-configured"},"zpl":"^XA^XZ","copies":1}`,
			want: http.StatusNotFound,
		},
		{
			name: "generic target is unavailable",
			body: `{"target":{"type":"generic","printerId":"test"},"zpl":"^XA^XZ","copies":1}`,
			want: http.StatusBadRequest,
		},
		{
			name: "too many copies",
			body: `{"target":{"type":"zebra","printerId":"test"},"zpl":"^XA^XZ","copies":100}`,
			want: http.StatusBadRequest,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := http.Post(server.URL+"/api/print", "application/json", strings.NewReader(tt.body))
			if err != nil {
				t.Fatalf("POST /api/print: %v", err)
			}
			defer res.Body.Close()
			if res.StatusCode != tt.want {
				data, _ := io.ReadAll(res.Body)
				t.Fatalf("status = %d, want %d; body = %s", res.StatusCode, tt.want, data)
			}
		})
	}
}

func TestLabelServerXMLUsesTheSameSafePrintPath(t *testing.T) {
	listener, received := startCapturePrinter(t)
	defer listener.Close()

	backend := backendForListener(t, listener, "xml-printer")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	zpl := "^XA^FDXML bridge^FS^XZ"
	xmlBody := `<?xml version="1.0"?><PrintJob><Printer id="xml-printer"/><Copies>2</Copies><Zpl><![CDATA[` + zpl + `]]></Zpl></PrintJob>`
	res, err := http.Post(server.URL+"/api/labelserver", "application/xml", strings.NewReader(xmlBody))
	if err != nil {
		t.Fatalf("POST /api/labelserver: %v", err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/labelserver status = %d, body = %s", res.StatusCode, data)
	}
	if !bytes.Contains(data, []byte(`<PrintJobResult ok="true"`)) {
		t.Fatalf("unexpected XML success body: %s", data)
	}
	if got, want := string(awaitPrinterPayload(t, received)), zpl+zpl; got != want {
		t.Fatalf("printer payload = %q, want %q", got, want)
	}

	badXML := `<!DOCTYPE PrintJob [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><PrintJob><Zpl>&xxe;</Zpl></PrintJob>`
	badRes, err := http.Post(server.URL+"/api/labelserver", "application/xml", strings.NewReader(badXML))
	if err != nil {
		t.Fatalf("POST DTD XML: %v", err)
	}
	defer badRes.Body.Close()
	if badRes.StatusCode != http.StatusBadRequest {
		data, _ := io.ReadAll(badRes.Body)
		t.Fatalf("POST DTD XML status = %d, want 400; body = %s", badRes.StatusCode, data)
	}
}

func TestLabelServerXMLDefaultsOnlyWhenPrinterAndCopiesAreOmitted(t *testing.T) {
	listener, received := startCapturePrinter(t)
	defer listener.Close()

	backend := backendForListener(t, listener, "xml-default")
	server := httptest.NewServer(testPrintMux(backend))
	defer server.Close()

	zpl := "^XA^FDXML default^FS^XZ"
	validXML := `<PrintJob><Zpl><![CDATA[` + zpl + `]]></Zpl></PrintJob>`
	res, err := http.Post(server.URL+"/api/labelserver", "application/xml", strings.NewReader(validXML))
	if err != nil {
		t.Fatalf("POST default XML: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(res.Body)
		t.Fatalf("default XML status = %d, body = %s", res.StatusCode, data)
	}
	if got, want := string(awaitPrinterPayload(t, received)), zpl; got != want {
		t.Fatalf("printer payload = %q, want %q", got, want)
	}

	for _, body := range []string{
		`<PrintJob><Printer id=""/><Zpl>^XA^XZ</Zpl></PrintJob>`,
		`<PrintJob><Copies>0</Copies><Zpl>^XA^XZ</Zpl></PrintJob>`,
		`<PrintJob><Copies></Copies><Zpl>^XA^XZ</Zpl></PrintJob>`,
	} {
		badRes, err := http.Post(server.URL+"/api/labelserver", "application/xml", strings.NewReader(body))
		if err != nil {
			t.Fatalf("POST invalid XML: %v", err)
		}
		if badRes.StatusCode != http.StatusBadRequest {
			data, _ := io.ReadAll(badRes.Body)
			badRes.Body.Close()
			t.Fatalf("invalid XML status = %d, want 400; body = %s", badRes.StatusCode, data)
		}
		badRes.Body.Close()
	}
}

func TestPrintDiscoveryIsSafeWhenDisabled(t *testing.T) {
	mux := http.NewServeMux()
	registerPrintRoutes(mux, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/backend", nil)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("GET /api/backend status = %d, want 200", res.Code)
	}
	var discovery struct {
		APIVersion   int      `json:"apiVersion"`
		Capabilities []string `json:"capabilities"`
	}
	if err := json.NewDecoder(res.Body).Decode(&discovery); err != nil {
		t.Fatalf("decode discovery: %v", err)
	}
	if discovery.APIVersion != backendAPIVersion {
		t.Fatalf("discovery apiVersion = %d, want %d", discovery.APIVersion, backendAPIVersion)
	}
	if len(discovery.Capabilities) != 0 {
		t.Fatalf("disabled backend capabilities = %#v, want none", discovery.Capabilities)
	}
	if got := res.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("discovery Cache-Control = %q, want no-store", got)
	}

	printReq := httptest.NewRequest(http.MethodPost, "/api/print", strings.NewReader(`{}`))
	printReq.Header.Set("Content-Type", "application/json")
	printRes := httptest.NewRecorder()
	mux.ServeHTTP(printRes, printReq)
	if printRes.Code != http.StatusServiceUnavailable {
		t.Fatalf("POST /api/print status = %d, want 503", printRes.Code)
	}
	if got := printRes.Header().Get("ZPL-Error-Code"); got != "backend_disabled" {
		t.Fatalf("disabled print error code = %q, want backend_disabled", got)
	}
}

func TestPrintDiscoveryListsActiveCapabilitiesAndKeepsPrinterListFresh(t *testing.T) {
	backend := backendForPrinter(t, printer{ID: "test", Name: "Test", Host: "127.0.0.1", Port: "9100"}, "test")
	mux := testPrintMux(backend)

	res := httptest.NewRecorder()
	mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/backend", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("GET /api/backend status = %d, want 200", res.Code)
	}
	var discovery struct {
		APIVersion   int      `json:"apiVersion"`
		Capabilities []string `json:"capabilities"`
	}
	if err := json.NewDecoder(res.Body).Decode(&discovery); err != nil {
		t.Fatalf("decode discovery: %v", err)
	}
	if discovery.APIVersion != backendAPIVersion {
		t.Fatalf("discovery apiVersion = %d, want %d", discovery.APIVersion, backendAPIVersion)
	}
	if got, want := strings.Join(discovery.Capabilities, ","), "printers.list,print.zebra,labelserver.xml"; got != want {
		t.Fatalf("active discovery capabilities = %q, want %q", got, want)
	}

	printers := httptest.NewRecorder()
	mux.ServeHTTP(printers, httptest.NewRequest(http.MethodGet, "/api/printers", nil))
	if printers.Code != http.StatusOK {
		t.Fatalf("GET /api/printers status = %d, want 200", printers.Code)
	}
	if got := printers.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("printer-list Cache-Control = %q, want no-store", got)
	}
}

func TestValidTemplateNameAccepts200ZPL(t *testing.T) {
	if !validTemplateName("legacy.200zpl") {
		t.Fatal("validTemplateName() rejected a supported .200zpl template")
	}
}

func writeTestRegistry(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "printers.csv")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("write test registry: %v", err)
	}
	return path
}

func startCapturePrinter(t *testing.T) (net.Listener, <-chan []byte) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("start fake printer: %v", err)
	}
	received := make(chan []byte, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		payload, err := io.ReadAll(conn)
		if err == nil {
			received <- payload
		}
	}()
	return listener, received
}

func backendForListener(t *testing.T, listener net.Listener, id string) *printBackend {
	t.Helper()
	host, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("split test printer address: %v", err)
	}
	return backendForPrinter(t, printer{ID: id, Name: "Test Zebra", Host: host, Port: port}, id)
}

func backendForPrinter(t *testing.T, p printer, defaultID string) *printBackend {
	t.Helper()
	registry := &printerRegistry{
		byID:      map[string]printer{p.ID: p},
		ordered:   []printer{p},
		defaultID: defaultID,
	}
	backend, err := newPrintBackend(registry, "", time.Second, time.Second, 0)
	if err != nil {
		t.Fatalf("newPrintBackend: %v", err)
	}
	return backend
}

func testPrintMux(backend *printBackend) *http.ServeMux {
	mux := http.NewServeMux()
	registerPrintRoutes(mux, backend)
	return mux
}

func awaitPrinterPayload(t *testing.T, received <-chan []byte) []byte {
	t.Helper()
	select {
	case payload := <-received:
		return payload
	case <-time.After(2 * time.Second):
		t.Fatal("fake printer did not receive a payload")
		return nil
	}
}
