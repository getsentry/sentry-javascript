#!/bin/bash
set -e

yarn
# We have to build other packages first, as we use absolute packages import in TypeScript
yarn build
cd packages/browser
yarn test:saucelabs
