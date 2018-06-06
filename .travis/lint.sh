#!/bin/bash
set -e

yarn lerna bootstrap
yarn lint
