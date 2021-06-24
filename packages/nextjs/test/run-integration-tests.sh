#!/usr/bin/env bash

set -e

for version in 10 11; do
  NODE_VERSION=$(node -v)
  NODE_MAJOR=$(echo $NODE_VERSION | cut -c2- | cut -d. -f1)

  # Next 10 requires at least Node v10
  if [ "$NODE_MAJOR" -lt "10" ]; then
    echo "[next] Next.js is not compatible with Node versions older than v10. Current version $NODE_VERSION"
    exit 0
  fi

  echo "[next@$version] Running integration tests on $NODE_VERSION"

  pushd "$(dirname "$0")/integration" > /dev/null
  rm -rf node_modules .next .env.local 2> /dev/null || true
  yarn --no-lockfile
  yarn add "next@$version"
  yarn build

  EXIT_CODE=0
  node test/server.js --silent || EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]
  then
    echo "[next@$version] Server integration tests passed."
  else
    echo "[next@$version] Server integration tests failed."
    exit 1
  fi

  # Next 11 requires at least Node v12
  if [ "$NODE_VERSION" -ge "12" ]; then
    EXIT_CODE=0
    node test/client.js --silent || EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]
    then
      echo "[next@$version] Client integration tests passed."
    else
      echo "[next@$version] Client integration tests failed."
      exit 1
    fi
  else
    echo "[next$version] Not compatible with Node $NODE_VERSION"
  fi

  yarn remove next
  popd > /dev/null
done;
