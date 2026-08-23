// Command zpl-studio-server serves ZPL-Studio as a single self-contained
// binary. The web app itself stays static; this server embeds and serves its
// assets and can optionally enable shared templates and a configured Zebra
// print backend (see README.md), so deployment is "copy one binary, run it".
package main

import (
	"embed"
	"flag"
	"log"
	"net/http"
	"time"
)

// The repository root is also the static Pages tree: the landing page lives
// at /, ZPL-Studio at /studio/ and the ZPLkit sources/bundles at /zplkit/.
// standalone server embeds that exact tree so static Pages and the local Go
// binary stay on the same asset layout.
//
//go:embed index.html favicon.svg og-zpl-studio.png css en fr studio/index.html studio/css studio/fonts zplkit
var assets embed.FS

func withLogging(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		h.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on; use 0.0.0.0:8080 only behind network controls")
	templatesDir := flag.String("templates", "templates", "directory holding the shared .zpl template library (see templates.go); created on first save if missing")
	printersFile := flag.String("printers", "", "printer registry CSV; enables the optional direct Zebra print backend when set")
	defaultPrinter := flag.String("default-printer", "", "printer ID to use when a print request omits printerId (overrides the CSV default column)")
	printerDialTimeout := flag.Duration("printer-dial-timeout", 3*time.Second, "maximum time to connect to a configured Zebra printer")
	printerWriteTimeout := flag.Duration("printer-write-timeout", 10*time.Second, "maximum time to write one Zebra print job")
	printerRetries := flag.Int("printer-retries", 1, "additional connection attempts after a failure before any ZPL bytes were written (0-10)")
	flag.Parse()

	var backend *printBackend
	if *printersFile != "" {
		registry, err := loadPrinterRegistry(*printersFile)
		if err != nil {
			log.Fatalf("Drucker-Konfiguration: %v", err)
		}
		backend, err = newPrintBackend(registry, *defaultPrinter, *printerDialTimeout, *printerWriteTimeout, *printerRetries)
		if err != nil {
			log.Fatalf("Druck-Backend: %v", err)
		}
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(assets)))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	registerTemplateRoutes(mux, *templatesDir)
	registerPrintRoutes(mux, backend)

	server := &http.Server{
		Addr:              *addr,
		Handler:           withLogging(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	log.Printf("ZPL-Studio läuft auf http://%s (Strg+C zum Beenden)", *addr)
	log.Fatal(server.ListenAndServe())
}
