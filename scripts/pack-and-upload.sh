#!/bin/bash
set -e

yarn
yarn build
node scripts/package-and-upload-to-zeus.js
