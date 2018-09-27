#!/bin/bash
set -e

RAVEN="raven-js"
source .scripts/detect-raven.sh

if [[ $SHOULD_RUN == "true" ]]; then
  cd packages/raven-js
  npm install
  npm run lint
  npm run test
fi
