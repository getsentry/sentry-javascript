#!/bin/bash
set -e

yarn && yarn build && yarn test && yarn codecov

# Run raven-node
if [[ ("$RAVEN_NODE_CHANGES" = "true" || "$TRAVIS_PULL_REQUEST" = "false" ) ]]; then
  cd packages/raven-node
  npm install
  if [[ "$TRAVIS_SECURE_ENV_VARS" = "true" ]]; then
    npm run test-full
  else
    npm run test
  fi
  cd ../..
fi
