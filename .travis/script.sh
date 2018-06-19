#!/bin/bash
set -e

source .travis/before_script.sh

# Run @sentry/*
if [ ${NODE_VERSION:1:1} > 5 ]; then
  yarn && yarn build && yarn test && yarn codecov
fi

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

# Run raven-js
if [[ ("$RAVEN_JS_CHANGES" = "true" || "$TRAVIS_PULL_REQUEST" = "false" ) && ${NODE_VERSION:1:1} = 8 ]]; then
  cd packages/raven-js
  npm install
  npm run test
  if [[ "$TRAVIS_SECURE_ENV_VARS" = "true" ]]; then
    npm run test:ci
  fi
  cd ../..
fi
