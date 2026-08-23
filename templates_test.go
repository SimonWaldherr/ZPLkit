package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
