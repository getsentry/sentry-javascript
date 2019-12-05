#!/bin/bash
set -e

yarn
# We have to build it first, so that TypeScript Types are recognized correctly
yarn build
if [[ ! -z $DANGER_GITHUB_API_TOKEN ]]; then
  yarn lint:json
  yarn test
  yarn codecov
  yarn danger ci || true # for external PRs danger will fail because of token
else
  yarn lint
  yarn test
fi
