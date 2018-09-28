#!/bin/bash
set -e

yarn
yarn build
yarn test
