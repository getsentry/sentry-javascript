#!/bin/bash
set -e
source ~/.nvm/nvm.sh

# We need this check to skip engines check for typescript-tslint-plugin package
if [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 6 ]]; then
  nvm use 8
  yarn install --ignore-engines --ignore-scripts
  yarn build --ignore="@sentry/ember"
  nvm use 6
  yarn test --ignore="@sentry/browser" --ignore="@sentry/integrations" --ignore="@sentry/react" --ignore="@sentry/ember" --ignore="@sentry/tracing" # latest version of karma doesn't run on node 6
elif [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 8 ]]; then
  yarn install --ignore-engines --ignore-scripts
  yarn build --ignore="@sentry/ember"
  yarn test --ignore="@sentry/tracing" --ignore="@sentry/react" --ignore="@sentry/ember"
else
  yarn install
  yarn build --ignore="@sentry/ember"
  yarn test --ignore="@sentry/ember"
fi
