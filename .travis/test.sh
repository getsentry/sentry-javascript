#!/bin/bash
set -e

yarn
yarn lerna bootstrap
yarn build
yarn test
