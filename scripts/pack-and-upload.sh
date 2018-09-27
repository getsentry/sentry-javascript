#!/bin/bash
set -e

yarn add @zeus-ci/cli -g
yarn
yarn build
node scripts/package-and-upload-to-zeus.js
