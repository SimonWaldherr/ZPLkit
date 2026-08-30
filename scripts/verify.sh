#!/usr/bin/env bash
# Reproducible local/CI quality gate. It intentionally needs no npm packages:
# every JavaScript test uses Node's standard library only.
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Keep the verifier usable in restricted CI/container environments where the
# user's global Go cache is read-only. An explicitly supplied GOCACHE still
# takes precedence.
zplkit_go_cache="${GOCACHE:-${TMPDIR:-/tmp}/zplkit-go-build-cache}"

GOCACHE="$zplkit_go_cache" go test ./...
GOCACHE="$zplkit_go_cache" go vet ./...

for source_file in zplkit/*.js studio/*.js test/*.js; do
  node --check "$source_file"
done

for test_file in test/*.test.js; do
  node "$test_file"
done

GOCACHE="$zplkit_go_cache" go run tools/bundle-lib.go -check

printf 'Alle Prüfungen erfolgreich.\n'
