#!/usr/bin/env bash

source test/integration_test_utils.sh

set -e

START_TIME=$(date -R)

function cleanup {
  echo "[nextjs] Cleaning up..."
  mv next.config.js.bak next.config.js 2>/dev/null || true
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

for NEXTJS_VERSION in 10 11 12; do

  # export this to the env so that we can behave differently depending on which version of next we're testing, without
  # having to pass this value from function to function to function to the one spot, deep in some callstack, where we
  # actually need it
  export NEXTJS_VERSION=$NEXTJS_VERSION

  # Next 10 requires at least Node v10
  if [ "$NODE_MAJOR" -lt "10" ]; then
    echo "[nextjs] Next.js is not compatible with versions of Node older than v10. Current version $NODE_VERSION"
    exit 0
  fi

  # Next.js v11 requires at least Node v12
  if [ "$NODE_MAJOR" -lt "12" ] && [ "$NEXTJS_VERSION" -eq "11" ]; then
    echo "[nextjs$NEXTJS_VERSION] Not compatible with Node $NODE_MAJOR"
    exit 0
  fi

  echo "[nextjs@$NEXTJS_VERSION] Preparing environment..."
  rm -rf node_modules .next .env.local 2>/dev/null || true

  echo "[nextjs@$NEXTJS_VERSION] Installing dependencies..."
  # set the desired version of next long enough to run yarn, and then restore the old version (doing the restoration now
  # rather than during overall cleanup lets us look for "latest" in both loops)
  cp package.json package.json.bak
  if [[ $(uname) == "Darwin" ]]; then
    sed -i "" /"next.*latest"/s/latest/"${NEXTJS_VERSION}.x"/ package.json
  else
    sed -i /"next.*latest"/s/latest/"${NEXTJS_VERSION}.x"/ package.json
  fi
  yarn --no-lockfile --silent >/dev/null 2>&1
  # if applicable, use local versions of `@sentry/cli` and/or `@sentry/webpack-plugin` (these commands no-op unless
  # LINKED_CLI_REPO and/or LINKED_PLUGIN_REPO are set)
  linkcli && linkplugin
  mv -f package.json.bak package.json 2>/dev/null || true

  SHOULD_RUN_WEBPACK_5=(true)
  # Only run Webpack 4 tests for Next 10 and Next 11
  if [ "$NEXTJS_VERSION" -eq "10" ] || [ "$NEXTJS_VERSION" -eq "11" ]; then
    SHOULD_RUN_WEBPACK_5+=(false)
  fi

  for RUN_WEBPACK_5 in ${SHOULD_RUN_WEBPACK_5[*]}; do
    [ "$RUN_WEBPACK_5" == true ] &&
      WEBPACK_VERSION=5 ||
      WEBPACK_VERSION=4

    # next 10 defaults to webpack 4 and next 11 defaults to webpack 5, but each can use either based on settings
    if [ "$NEXTJS_VERSION" -eq "10" ]; then
      sed "s/%RUN_WEBPACK_5%/$RUN_WEBPACK_5/g" <next10.config.template >next.config.js
    else
      sed "s/%RUN_WEBPACK_5%/$RUN_WEBPACK_5/g" <next11.config.template >next.config.js
    fi

    echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Building..."
    yarn build

    # if the user hasn't passed any args, use the default one, which restricts each test to only outputting success and
    # failure messages
    args=$*
    if [[ ! $args ]]; then
      args="--silent"
    fi

    # we keep this updated as we run the tests, so that if it's ever non-zero, we can bail
    EXIT_CODE=0

    echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Running server tests with options: $args"
    node test/server.js $args || EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Server integration tests passed"
    else
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Server integration tests failed"
      exit 1
    fi

    echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Running client tests with options: $args"
    node test/client.js $args || EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Client integration tests passed"
    else
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Client integration tests failed"
      exit 1
    fi
  done
done
