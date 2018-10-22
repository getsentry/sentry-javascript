#!/bin/bash
set -eux

yarn global add @zeus-ci/cli
yarn
yarn build

# Temp workaround
git clone https://github.com/HazAT/lerna.git
cd lerna
npm link
cd ../
npm link lerna
############################################

# Upload NPM packages
node scripts/package-and-upload-to-zeus.js

# Upload "sentry-browser" bundles
zeus upload -t "application/javascript" ./packages/browser/build/bundle*

# Upload docs
make build-docs
zip -r gh-pages ./docs/
zeus upload -t "application/zip+docs" ./gh-pages.zip
