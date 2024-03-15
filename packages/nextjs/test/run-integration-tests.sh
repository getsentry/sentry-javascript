#!/usr/bin/env bash

source test/integration_test_utils.sh

set -e

START_TIME=$(date -R)

function cleanup {
  echo "[nextjs] Cleaning up..."
  mv next.config.js.bak next.config.js 2>/dev/null || true
  mv -f package.json.bak package.json 2>/dev/null || true
  rm -rf node_modules 2>/dev/null || true

  # Delete yarn's cached versions of sentry packages added during this test run, since every test run installs multiple
  # copies of each package. Without this, the cache can balloon in size quickly if integration tests are being run
  # multiple times in a row.
  find "$(yarn cache dir)" -iname "npm-@sentry*" -newermt "$START_TIME" -mindepth 1 -maxdepth 1 -exec rm -rf {} \;

  echo "[nextjs] Test run complete"
}

trap cleanup EXIT

cd "$(dirname "$0")/integration"

NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -c2- | cut -d. -f1)
echo "Running integration tests on Node $NODE_VERSION"

# make a backup of our config file so we can restore it when we're done
mv next.config.js next.config.js.bak

for NEXTJS_VERSION in 13; do
  for USE_APPDIR in true false; do
    if ([ "$NODE_MAJOR" -lt "16" ]) && [ "$USE_APPDIR" == true ]; then
      # App dir doesn not work on Node.js < 16
      continue
    fi

    # export this to the env so that we can behave differently depending on which version of next we're testing, without
    # having to pass this value from function to function to function to the one spot, deep in some callstack, where we
    # actually need it
    export NEXTJS_VERSION=$NEXTJS_VERSION
    export NODE_MAJOR=$NODE_MAJOR
    export USE_APPDIR=$USE_APPDIR

    echo "[nextjs@$NEXTJS_VERSION] Preparing environment..."
    rm -rf node_modules .next .env.local 2>/dev/null || true

    echo "[nextjs@$NEXTJS_VERSION] Installing dependencies..."

    # Pin to a specific version
    if [ "$NEXTJS_VERSION" -eq "13" ]; then
      NEXTJS_PACKAGE_JSON_VERSION="13.2.0"
    else
      NEXTJS_PACKAGE_JSON_VERSION="$NEXTJS_VERSION.x"
    fi

    # set the desired version of next long enough to run yarn, and then restore the old version (doing the restoration now
    # rather than during overall cleanup lets us look for "latest" in every loop)
    cp package.json package.json.bak
    if [[ $(uname) == "Darwin" ]]; then
      sed -i "" /"next.*latest"/s/latest/"${NEXTJS_PACKAGE_JSON_VERSION}"/ package.json
    else
      sed -i /"next.*latest"/s/latest/"${NEXTJS_PACKAGE_JSON_VERSION}"/ package.json
    fi

    # Yarn install randomly started failing because it couldn't find some cache  so for now we need to run these two commands which seem to fix it.
    # It was pretty much this issue: https://github.com/yarnpkg/yarn/issues/5275
    rm -rf node_modules
    yarn cache clean

    # We have to use `--ignore-engines` because sucrase claims to need Node 12, even though tests pass just fine on Node 10
    yarn --no-lockfile --ignore-engines

    # if applicable, use local versions of `@sentry/cli` and/or `@sentry/webpack-plugin` (these commands no-op unless
    # LINKED_CLI_REPO and/or LINKED_PLUGIN_REPO are set)
    linkcli && linkplugin
    mv -f package.json.bak package.json 2>/dev/null || true

    if [ "$NEXTJS_VERSION" -eq "13" ]; then
      if [ "$USE_APPDIR" == true ]; then
        cat next13.appdir.config.template > next.config.js
      else
        cat next13.config.template > next.config.js
      fi
    fi

    echo "[nextjs@$NEXTJS_VERSION] Building..."
    yarn build

    # we keep this updated as we run the tests, so that if it's ever non-zero, we can bail
    EXIT_CODE=0

    if [ "$USE_APPDIR" == true ]; then
      echo "Skipping server tests for appdir"
    else
      echo "[nextjs@$NEXTJS_VERSION] Running server tests with options: $args"
      (cd .. && yarn test:integration:server) || EXIT_CODE=$?
    fi

    if [ $EXIT_CODE -eq 0 ]; then
      echo "[nextjs@$NEXTJS_VERSION] Server integration tests passed"
    else
      echo "[nextjs@$NEXTJS_VERSION] Server integration tests failed"
      exit 1
    fi

    if [ "$NODE_MAJOR" -lt "14" ]; then
      echo "[nextjs@$NEXTJS_VERSION] Skipping client tests on Node $NODE_MAJOR"
    else
      echo "[nextjs@$NEXTJS_VERSION] Running client tests with options: $args"
      (cd .. && yarn test:integration:client) || EXIT_CODE=$?
      if [ $EXIT_CODE -eq 0 ]; then
        echo "[nextjs@$NEXTJS_VERSION] Client integration tests passed"
      else
        echo "[nextjs@$NEXTJS_VERSION] Client integration tests failed"
        exit 1
      fi
    fi
  done
done
