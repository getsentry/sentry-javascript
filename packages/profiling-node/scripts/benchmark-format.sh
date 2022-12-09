#!/bin/bash
set -eo pipefail

BEFORE="${1}";
AFTER="${2}";

if [[ $# -ne 2 ]] ; then
    echo 'requires two arguments: before and after sha or tags'
    exit 1
fi

if [[ -n $(git status -s) ]]; then
    echo 'Please commit your changes before running this script.'
    exit 1
fi

git checkout "$BEFORE";
yarn build:benchmark:format;
RUN_NAME=$BEFORE yarn benchmark:format;
git stash;
git checkout "$AFTER";
git stash pop;
yarn build:benchmark:format;
RUN_NAME=$AFTER yarn benchmark:format;
BEFORE="$BEFORE" AFTER="$AFTER" yarn benchmark:format;
git restore .;
