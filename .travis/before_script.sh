#!/bin/bash
set -e

CHANGES=$(git --no-pager diff --name-only FETCH_HEAD $(git merge-base FETCH_HEAD master))

if [ -n "$(grep 'raven-js' <<< "$CHANGES")" ]; then
  export RAVEN_JS_CHANGES=true
fi

if [ -n "$(grep 'raven-node' <<< "$CHANGES")" ]; then
  export RAVEN_NODE_CHANGES=true
fi

FORCE=$(git log --format=%B --no-merges -n 1)

if [ -n "$(grep '\[force ci\]' <<< "$FORCE")" ]; then
  export RAVEN_JS_CHANGES=true
  export RAVEN_NODE_CHANGES=true
fi
