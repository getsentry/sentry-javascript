#!/bin/bash
set -e

# control which packages we test on each version of node
if [[ "$(cut -d. -f1 <<<"$NODE_VERSION")" -le 6 ]]; then

  # install legacy versions of packages whose current versions don't support node 6
  # ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  cd packages/node
  yarn add --dev --ignore-engines --ignore-scripts nock@10.x
  cd ../..
  cd packages/tracing
  yarn add --dev --ignore-engines --ignore-scripts jsdom@11.x
  cd ../..
  cd packages/utils
  yarn add --dev --ignore-engines --ignore-scripts jsdom@11.x
  cd ../..

  # only test against @sentry/node and its dependencies - node 6 is too old for anything else to work
  yarn test --scope="@sentry/core" --scope="@sentry/hub" --scope="@sentry/minimal" --scope="@sentry/node" --scope="@sentry/utils" --scope="@sentry/tracing"

elif [[ "$(cut -d. -f1 <<<"$NODE_VERSION")" -le 8 ]]; then

  # install legacy versions of packages whose current versions don't support node 8
  # ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  cd packages/tracing
  yarn add --dev --ignore-engines --ignore-scripts jsdom@15.x
  cd ../..
  cd packages/utils
  yarn add --dev --ignore-engines --ignore-scripts jsdom@15.x
  cd ../..

  # ember tests happen separately, and the rest fail on node 8 for various syntax or dependency reasons
  yarn test --ignore="@sentry/ember" --ignore="@sentry-internal/eslint-plugin-sdk" --ignore="@sentry/react" --ignore="@sentry/wasm" --ignore="@sentry/gatsby" --ignore="@sentry/serverless" --ignore="@sentry/nextjs"

else
  yarn test --ignore="@sentry/ember"

fi
