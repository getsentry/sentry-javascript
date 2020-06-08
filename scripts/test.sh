#!/bin/bash
set -e
source ~/.nvm/nvm.sh

# We need this check to skip engines check for typescript-tslint-plugin package
if [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 6 ]]; then
  nvm use 8
  yarn install --ignore-engines
  yarn build
  nvm use 6
  yarn test --ignore="@sentry/browser" --ignore="@sentry/integrations" --ignore="@sentry/react" # latest version of karma doesn't run on node 6
else
  yarn install
  yarn build
  yarn test
fi
