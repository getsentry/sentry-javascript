#!/bin/sh
set -e

SCRIPT=$(readlink -f "$0") # Absolute path to this script
SCRIPT_DIR=$(dirname "$SCRIPT") # Absolute path of directory containing this script

cd $SCRIPT_DIR/.. # Navigate to root of repository to build all the packages
yarn build:npm # create tarballs

# Stop Verdaccio Test Registry container if it was already running - don't throw if container wasn't running
docker stop verdaccio-e2e-test-registry || true

# Start Verdaccio Test Registry
docker run --detach --rm \
  --name verdaccio-e2e-test-registry \
  -p 4873:4873 \
  -v $SCRIPT_DIR/verdaccio/conf:/verdaccio/conf \
  verdaccio/verdaccio:5.15.3

# Publish built packages to Verdaccio Test Registry
for package in "$SCRIPT_DIR"/../packages/*/sentry-*.tgz; do
  npm publish $package --registry http://localhost:4873
done

# TODO: Run e2e tests here

docker stop verdaccio-e2e-test-registry
