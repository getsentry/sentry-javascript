#!/bin/bash
set -e

source ./before_script.sh

# Run @sentry/*
if [[ "$PACKAGES" = "true" ]]; then
  yarn && yarn build && yarn test && yarn codecov
else
  echo "**********************************************************************";
  echo "SKIPPING @sentry/*";
  echo "PACKAGES: $PACKAGES";
  echo "**********************************************************************";
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
else
  echo "**********************************************************************";
  echo "SKIPPING raven-node";
  echo "RAVEN_NODE_CHANGES: $RAVEN_NODE_CHANGES";
  echo "TRAVIS_PULL_REQUEST: $TRAVIS_PULL_REQUEST";
  echo "**********************************************************************";
fi

# Run raven-js
if [[ ("$RAVEN_JS_CHANGES" = "true" || "$TRAVIS_PULL_REQUEST" = "false" ) ]]; then
  cd packages/raven-js
  npm install
  npm run test
  if [[ "$TRAVIS_SECURE_ENV_VARS" = "true" ]]; then
    npm run test:ci
  fi
  cd ../..
else
  echo "**********************************************************************";
  echo "SKIPPING raven-js";
  echo "RAVEN_JS_CHANGES: $RAVEN_NODE_CHANGES";
  echo "TRAVIS_PULL_REQUEST: $TRAVIS_PULL_REQUEST";
  echo "**********************************************************************";
fi
