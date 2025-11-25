#!/usr/bin/env bash
set -euo pipefail

# Ensure we are at the repository root
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

npm run build

for artifact in dist/bundle.js dist/bundle.js.map dist/styles.css dist/styles.css.map; do
  if [ ! -f "$artifact" ]; then
    echo "Expected artifact not found: $artifact" >&2
    exit 1
  fi
  cp "$artifact" "$REPO_ROOT"
done
