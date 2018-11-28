#!/bin/bash
set -eux

yarn global add @zeus-ci/cli
yarn
yarn build

# Sanity Check
yarn lerna changed --include-merged-tags -p

############################################

# Upload NPM packages
node scripts/package-and-upload-to-zeus.js

# Upload "sentry-browser" bundles
zeus upload -t "application/javascript" ./packages/browser/build/bundle*

# Upload docs
make build-docs
zip -r gh-pages ./docs/
zeus upload -t "application/zip+docs" ./gh-pages.zip
