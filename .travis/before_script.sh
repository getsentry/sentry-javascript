#!/bin/bash
set -e

if [[ $TRAVIS_BRANCH == 'master' ]]; then
CHANGES="[force ci]"
else
CHANGES=$(git --no-pager diff --name-only FETCH_HEAD $(git merge-base FETCH_HEAD master))
fi

if [ -n "$(grep 'raven-js' <<< "$CHANGES")" ]; then
  RAVEN_JS_CHANGES=true
fi

if [ -n "$(grep 'raven-node' <<< "$CHANGES")" ]; then
  RAVEN_NODE_CHANGES=true
fi

FORCE=$(git log --format=%B --no-merges -n 1)

if [ -n "$(grep '\[force ci\]' <<< "$FORCE")" ]; then
  RAVEN_JS_CHANGES=true
  RAVEN_NODE_CHANGES=true
fi

NODE_VERSION=$(node -v);
