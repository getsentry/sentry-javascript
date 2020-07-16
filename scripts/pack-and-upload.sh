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
# Upload "integrations" bundles
zeus upload -t "application/javascript" ./packages/integrations/build/*
# Upload "apm" bundles
zeus upload -t "application/javascript" ./packages/apm/build/*
# Upload "tracing" bundles
zeus upload -t "application/javascript" ./packages/tracing/build/*
