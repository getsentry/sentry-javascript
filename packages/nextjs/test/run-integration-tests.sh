#!/usr/bin/env bash

set -e

function cleanup {
  echo "[nextjs] Cleaning up..."
  mv next.config.js.bak next.config.js 2> /dev/null || true
  yarn remove next > /dev/null 2>&1 || true
  echo "[nextjs] Test run complete"
}

trap cleanup EXIT

cd "$(dirname "$0")/integration"

for NEXTJS_VERSION in 10 11; do
  NODE_VERSION=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -c2- | cut -d. -f1)

  # Next 10 requires at least Node v10
  if [ "$NODE_MAJOR" -lt "10" ]; then
    echo "[nextjs] Next.js is not compatible with versions of Node older than v10. Current version $NODE_VERSION"
    exit 0
  fi

  # Next.js v11 requires at least Node v12
  if [ "$NODE_MAJOR" -lt "12" ] && [ "$NEXTJS_VERSION" -eq "10" ]; then
    echo "[nextjs$NEXTJS_VERSION] Not compatible with Node $NODE_VERSION"
    exit 0
  fi

  echo "[nextjs@$NEXTJS_VERSION] Running integration tests on $NODE_VERSION"

  echo "[nextjs@$NEXTJS_VERSION] Preparing environment..."
  mv next.config.js next.config.js.bak
  rm -rf node_modules .next .env.local 2> /dev/null || true

  echo "[nextjs@$NEXTJS_VERSION] Installing dependencies..."
  yarn --no-lockfile --silent > /dev/null 2>&1
  yarn add "next@$NEXTJS_VERSION" > /dev/null 2>&1

  for RUN_WEBPACK_5 in false true; do
    [ "$RUN_WEBPACK_5" == true ] &&
      WEBPACK_VERSION=5 ||
      WEBPACK_VERSION=4

    if [ "$NEXTJS_VERSION" -eq "10" ]; then
      sed "s/%RUN_WEBPACK_5%/$RUN_WEBPACK_5/g" < next10.config.template > next.config.js
    else
      sed "s/%RUN_WEBPACK_5%/$RUN_WEBPACK_5/g" < next11.config.template > next.config.js
    fi

    echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Building..."
    yarn build | grep "Using webpack"

    EXIT_CODE=0
    node test/server.js --silent || EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]
    then
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Server integration tests passed"
    else
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Server integration tests failed"
      exit 1
    fi

    EXIT_CODE=0
    node test/client.js --silent || EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]
    then
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Client integration tests passed"
    else
      echo "[nextjs@$NEXTJS_VERSION | webpack@$WEBPACK_VERSION] Client integration tests failed"
      exit 1
    fi
  done
done;
