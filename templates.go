// Server-side ZPL template library: an optional extension to the otherwise
// 100%-static app (see README.md) that lets a folder of .zpl templates be
// shared centrally instead of living only on each user's own machine (the
// local-folder library via the File System Access API in supported browsers).
// app.js probes for this API on load and falls back to that
// local-only behavior if it's absent - see probeServerTemplates() there.
//
// Contract advertised by the optional Go backend:
//
//	GET  /api/templates             -> {"files":[{"name","size","modified"}, ...]}
//	GET  /api/templates?name=X.zpl  -> raw file content (text/plain)
//	PUT  /api/templates?name=X.zpl  -> body is the new content; {"ok":true}
package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
)

// Same extensions the client-side library filter already accepts (see the
// /\.(zpl|200zpl|300zpl|txt|prn)$/i regex in refreshLibraryList in app.js) - kept
// in sync deliberately, not just coincidentally identical.
var templateNameRE = regexp.MustCompile(`(?i)^[^/\\]+\.(zpl|200zpl|300zpl|txt|prn)$`)

// Generous for a ZPL label (even one with an embedded ASCII-hex graphic),
// far below anything that looks like abuse of a write endpoint.
const maxTemplateBytes = 5 << 20 // 5 MiB

type templateFileInfo struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

// validTemplateName rejects anything that isn't a bare filename matching the
// allow-listed extensions. filepath.Base(name) == name is the actual path-
// traversal defense (no "/", "\", or ".." component survives it); the regex
// on top is just an extension/charset allow-list for clean file names.
func validTemplateName(name string) bool {
	return name != "" && filepath.Base(name) == name && templateNameRE.MatchString(name)
}

func templatesListHandler(dir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		entries, err := os.ReadDir(dir)
		files := []templateFileInfo{}
		// A missing directory means "no templates configured yet" and remains
		// a normal empty library. Permission and I/O errors are different: a
		// 200 with an empty array would make the frontend select a broken server
		// source instead of preserving its local-folder fallback.
		if err != nil && !os.IsNotExist(err) {
			log.Printf("Vorlagenbibliothek kann %s nicht lesen: %v", dir, err)
			http.Error(w, "could not read templates directory", http.StatusInternalServerError)
			return
		}
		if err == nil {
			for _, e := range entries {
				if e.IsDir() || !validTemplateName(e.Name()) {
					continue
				}
				info, infoErr := e.Info()
				if infoErr != nil {
					continue
				}
				files = append(files, templateFileInfo{
					Name:     e.Name(),
					Size:     info.Size(),
					Modified: info.ModTime().UTC().Format(time.RFC3339),
				})
			}
		}
		sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]interface{}{"files": files})
	}
}

func templatesItemHandler(dir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if !validTemplateName(name) {
			http.Error(w, "invalid template name", http.StatusBadRequest)
			return
		}
		path := filepath.Join(dir, name)
		switch r.Method {
		case http.MethodGet:
			data, err := os.ReadFile(path)
			if err != nil {
				if os.IsNotExist(err) {
					http.Error(w, "not found", http.StatusNotFound)
					return
				}
				log.Printf("Vorlage %s kann nicht gelesen werden: %v", name, err)
				http.Error(w, "could not read template", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Write(data)
		case http.MethodPut:
			r.Body = http.MaxBytesReader(w, r.Body, maxTemplateBytes)
			data, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "request too large or unreadable", http.StatusRequestEntityTooLarge)
				return
			}
			if err := os.MkdirAll(dir, 0o755); err != nil {
				http.Error(w, "could not create templates directory: "+err.Error(), http.StatusInternalServerError)
				return
			}
			if err := os.WriteFile(path, data, 0o644); err != nil {
				http.Error(w, "could not write file: "+err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Write([]byte(`{"ok":true}`))
		default:
			w.Header().Set("Allow", "GET, PUT")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// registerTemplateRoutes wires the template-library API into mux, rooted at
// templatesDir - which does not need to exist yet (see templatesListHandler/
// the PUT branch above, which creates it lazily on first write).
func registerTemplateRoutes(mux *http.ServeMux, templatesDir string) {
	list := templatesListHandler(templatesDir)
	item := templatesItemHandler(templatesDir)
	mux.HandleFunc("/api/templates", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("name") != "" {
			item(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		list(w, r)
	})
	log.Printf("Server-Vorlagenbibliothek: %s (unter /api/templates)", templatesDir)
}
