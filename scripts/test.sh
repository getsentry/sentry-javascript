#!/bin/bash
set -e

# We need this check to skip engines check for typescript-tslint-plugin package
if [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 6 ]]; then
  yarn install --ignore-engines
else
  yarn install
fi
yarn build
yarn test
