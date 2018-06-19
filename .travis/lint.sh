#!/bin/bash
set -e

source .travis/before_script.sh

# Run @sentry/*
if [ ${NODE_VERSION:1:1} > 5 ]; then
  yarn && yarn build && yarn lint
else
  echo "**********************************************************************";
  echo "SKIPPING @sentry/*";
  echo "**********************************************************************";
fi

# Run raven-node
if [[ ("$RAVEN_NODE_CHANGES" = "true" || "$TRAVIS_PULL_REQUEST" = "false" ) ]]; then
  cd packages/raven-node
  npm install
  npm run lint
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
  npm run lint
  cd ../..
else
  echo "**********************************************************************";
  echo "SKIPPING raven-js";
  echo "RAVEN_JS_CHANGES: $RAVEN_NODE_CHANGES";
  echo "TRAVIS_PULL_REQUEST: $TRAVIS_PULL_REQUEST";
  echo "**********************************************************************";
fi
