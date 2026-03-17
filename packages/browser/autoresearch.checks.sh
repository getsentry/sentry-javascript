#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

# Run browser package tests (suppress success output)
yarn test --reporter=dot 2>&1 | tail -30
