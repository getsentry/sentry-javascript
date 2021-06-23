#!/usr/bin/env bash

set -e

for version in 10 11; do
  echo "[next@$version] Running integration tests"
  
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

  EXIT_CODE=0
  node test/client.js --silent || EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]
  then
    echo "[next@$version] Client integration tests passed."
  else
    echo "[next@$version] Client integration tests failed."
    exit 1
  fi

  yarn remove next
  popd > /dev/null
done;