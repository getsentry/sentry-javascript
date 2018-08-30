#!/bin/bash
set -e

RAVEN="raven-js"
source .travis/detect-raven.sh

if [[ $SHOULD_RUN == "true" ]]; then
  cd packages/raven-js
  npm install
  npm run test:ci
fi

