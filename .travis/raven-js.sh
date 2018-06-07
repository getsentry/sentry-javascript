#!/bin/bash
set -e
cd packages/raven-js

npm install
npm run test

if [ "$TRAVIS_SECURE_ENV_VARS" == "true" ]; then
  npm run test:ci;
else
  exit 0;
fi
