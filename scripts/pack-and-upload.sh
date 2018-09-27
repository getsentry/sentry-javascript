#!/bin/bash
set -e

yarn add -g @zeus-ci/cli
yarn
yarn build
node scripts/package-and-upload-to-zeus.js
