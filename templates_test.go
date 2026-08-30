package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTemplatesListTreatsOnlyMissingDirectoryAsEmpty(t *testing.T) {
	missingDir := filepath.Join(t.TempDir(), "templates-not-created-yet")
	res := httptest.NewRecorder()
	templatesListHandler(missingDir).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/templates", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("missing templates directory status = %d, want 200", res.Code)
	}
	var payload struct {
		Files []templateFileInfo `json:"files"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode missing-directory response: %v", err)
	}
	if len(payload.Files) != 0 {
		t.Fatalf("missing directory files = %#v, want empty list", payload.Files)
	}
}

func TestTemplatesListReportsUnusablePathInsteadOfEmptyLibrary(t *testing.T) {
	path := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(path, []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("write unusable template path: %v", err)
	}
	res := httptest.NewRecorder()
	templatesListHandler(path).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/templates", nil))
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("unusable template path status = %d, want 500", res.Code)
	}
}

func TestTemplatesReadReportsIOErrorInsteadOfNotFound(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "directory.zpl"), 0o755); err != nil {
		t.Fatalf("create directory-shaped template: %v", err)
	}
	res := httptest.NewRecorder()
	templatesItemHandler(dir).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/templates?name=directory.zpl", nil))
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("unreadable template status = %d, want 500", res.Code)
	}
}

func TestTemplatePutReplacesFileWithoutLeavingTemporaryFiles(t *testing.T) {
	dir := t.TempDir()
	name := "shipping.zpl"
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatalf("write old template: %v", err)
	}
	want := strings.Repeat("^XA^FDatomic^FS^XZ\n", 256)
	request := httptest.NewRequest(http.MethodPut, "/api/templates?name="+name, strings.NewReader(want))
	response := httptest.NewRecorder()

	templatesItemHandler(dir).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200; body = %q", response.Code, response.Body.String())
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read replaced template: %v", err)
	}
	if string(got) != want {
		t.Fatalf("saved template differs: got %d bytes, want %d", len(got), len(want))
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat replaced template: %v", err)
	}
	if gotMode := info.Mode().Perm(); gotMode != 0o600 {
		t.Fatalf("saved template mode = %o, want existing mode 600", gotMode)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read template directory: %v", err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".zplkit-template-") {
			t.Fatalf("temporary file was not cleaned up: %s", entry.Name())
		}
	}
}
