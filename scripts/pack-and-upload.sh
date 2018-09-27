#!/bin/bash
set -e

yarn global add @zeus-ci/cli
yarn
yarn build
node scripts/package-and-upload-to-zeus.js
