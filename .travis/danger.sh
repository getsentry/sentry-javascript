#!/bin/bash
set -e

yarn
# We have to build it first, so that TypeScript Types are recognized correctly
yarn danger ci
