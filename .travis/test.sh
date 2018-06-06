#!/bin/bash
set -e

yarn lerna bootstrap
yarn build
yarn test
