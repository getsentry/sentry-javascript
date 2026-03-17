#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"

# Rebuild core if any core source files were modified (the CDN bundle uses built ESM output)
if git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null | grep -q '^packages/core/src/'; then
  echo "Core source changed — rebuilding @sentry/core..."
  (cd "$REPO_ROOT/packages/core" && yarn build:transpile 2>&1 | tail -1)
fi

# Rebuild browser-utils if any browser-utils source files were modified
if git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null | grep -q '^packages/browser-utils/src/'; then
  echo "Browser-utils source changed — rebuilding @sentry-internal/browser-utils..."
  (cd "$REPO_ROOT/packages/browser-utils" && yarn build:transpile 2>&1 | tail -1)
fi

# Build only the base CDN bundle (bundle.min.js)
npx rollup -c rollup.bundle.base-only.config.mjs 2>&1 | tail -3

# Measure gzipped size
GZIP_BYTES=$(cat build/bundles/bundle.min.js | gzip -9 | wc -c | tr -d ' ')
RAW_BYTES=$(wc -c < build/bundles/bundle.min.js | tr -d ' ')
GZIP_KB=$(echo "scale=4; $GZIP_BYTES / 1024" | bc)
RAW_KB=$(echo "scale=4; $RAW_BYTES / 1024" | bc)

echo "METRIC gzip_kb=$GZIP_KB"
echo "METRIC raw_kb=$RAW_KB"
echo "METRIC gzip_bytes=$GZIP_BYTES"
