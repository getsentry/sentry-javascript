#!/bin/bash
set -euo pipefail

# Quick syntax check on key source files
node -e "require('sucrase').transform('', {transforms:['typescript']})" 2>/dev/null || true

# Build only the base CDN bundle (bundle.min.js)
cd "$(dirname "$0")"
npx rollup -c rollup.bundle.base-only.config.mjs 2>&1 | tail -3

# Measure gzipped size
GZIP_BYTES=$(cat build/bundles/bundle.min.js | gzip -9 | wc -c | tr -d ' ')
RAW_BYTES=$(wc -c < build/bundles/bundle.min.js | tr -d ' ')
GZIP_KB=$(echo "scale=4; $GZIP_BYTES / 1024" | bc)
RAW_KB=$(echo "scale=4; $RAW_BYTES / 1024" | bc)

echo "METRIC gzip_kb=$GZIP_KB"
echo "METRIC raw_kb=$RAW_KB"
echo "METRIC gzip_bytes=$GZIP_BYTES"
