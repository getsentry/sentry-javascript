#!/bin/bash
set -e

# We need this check to skip engines check for typescript-tslint-plugin package
if [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 6 ]]; then
  yarn install --ignore-engines
  yarn build --ignore="@sentry/browser" --ignore="@sentry/integrations" --ignore="@sentry/apm" --ignore="@sentry/node"
  yarn build:es5 --scope="@sentry/apm"
  yarn build --scope="@sentry/node"
  yarn test --ignore="@sentry/browser" --ignore="@sentry/integrations" # latest version of karma doesn't run on node 6
else
  yarn install
  yarn build
  yarn test
fi
