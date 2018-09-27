#!/bin/bash
set -e

RAVEN="raven-node"
source .scripts/detect-raven.sh

if [[ $SHOULD_RUN == "true" ]]; then
  cd packages/raven-node
  npm install
  npm run lint
  npm run test
fi
