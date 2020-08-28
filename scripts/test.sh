#!/bin/bash
set -e
source ~/.nvm/nvm.sh

# We need this check to skip engines check for typescript-tslint-plugin package
if [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 6 ]]; then
  nvm use 8
  yarn install --ignore-engines --ignore-scripts
  # ember requires Node >= 10 to build
  yarn build --ignore="@sentry/ember"
  nvm use 6
  # browser can be tested only on Node >= v8 because Karma is not supporting anything older
  yarn test --ignore="@sentry/browser" --ignore="@sentry/integrations" --ignore="@sentry/react" --ignore="@sentry/gatsby" --ignore="@sentry/ember" --ignore="@sentry/tracing" --ignore="@sentry-internal/eslint-plugin-sdk" --ignore="@sentry-internal/eslint-config-sdk"
elif [[ "$(cut -d. -f1 <<< "$TRAVIS_NODE_VERSION")" -le 8 ]]; then
  yarn install --ignore-engines --ignore-scripts
  # ember requires Node >= 10 to build
  yarn build --ignore="@sentry/ember"
  # tracing, ember and react work only on Node >= v10
  yarn test --ignore="@sentry/tracing" --ignore="@sentry/react" --ignore="@sentry/gatsby" --ignore="@sentry/ember" --ignore="@sentry-internal/eslint-plugin-sdk" --ignore="@sentry-internal/eslint-config-sdk"
else
  yarn install
  yarn build
  yarn test
fi
