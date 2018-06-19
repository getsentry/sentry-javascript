#!/bin/bash
set -e

# Run @sentry/*
yarn && yarn build && yarn lint

# Run raven-node
if [[ ("$RAVEN_NODE_CHANGES" = "true" || "$TRAVIS_PULL_REQUEST" = "false" ) ]]; then
  cd packages/raven-node
  npm install
  npm run lint
  cd ../..
fi

# Run raven-js
if [[ ("$RAVEN_JS_CHANGES" = "true" || "$TRAVIS_PULL_REQUEST" = "false" ) ]]; then
  cd packages/raven-js
  npm install
  npm run lint
  cd ../..
fi
