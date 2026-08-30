// Command zpl-studio-server serves ZPL-Studio as a single self-contained
// binary. The web app itself stays static; this server embeds and serves its
// assets and can optionally enable shared templates and a configured Zebra
// print backend (see README.md), so deployment is "copy one binary, run it".
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
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

const serverShutdownTimeout = 10 * time.Second

// serveUntilShutdown keeps the process responsive to SIGINT/SIGTERM and lets
// in-flight template or print requests finish before the embedded server
// exits. This matters when the binary runs under systemd, Docker or an
// orchestrator, all of which stop services with SIGTERM rather than Ctrl+C.
func serveUntilShutdown(server *http.Server, shutdown context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-shutdown.Done():
		log.Printf("ZPL-Studio wird heruntergefahren …")
		ctx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			_ = server.Close()
			return fmt.Errorf("graceful shutdown: %w", err)
		}
		err := <-errCh
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
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
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	shutdown, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	log.Printf("ZPL-Studio läuft auf http://%s (Strg+C zum Beenden)", *addr)
	if err := serveUntilShutdown(server, shutdown); err != nil {
		log.Fatal(err)
	}
}
