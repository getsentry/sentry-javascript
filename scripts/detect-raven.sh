#!/bin/bash
set -e

echo ""
echo "RAVEN: $RAVEN"

# Does any of the commits in a PR contain "[force ci]" string?
COMMITS=$(git --no-pager log master.. --no-merges --format=%s)
if [[ -n "$(grep '\[force ci\]' <<< "$COMMITS")" ]]; then
  HAS_FORCE_COMMIT=true
else
  HAS_FORCE_COMMIT=false
fi

# echo "COMMITS: $COMMITS"
echo "HAS_FORCE_COMMIT: $HAS_FORCE_COMMIT"

# Does any changed file lives in raven-js/raven-node directory?
CHANGES=$(git --no-pager diff --name-only master)
if [[ -n "$(grep "$RAVEN" <<< "$CHANGES")" ]]; then
  HAS_CHANGES=true
else
  HAS_CHANGES=false
fi

echo "HAS_CHANGES: $HAS_CHANGES"

# If any of the above is true, run tests
if [[ ( $HAS_FORCE_COMMIT == "true" || $HAS_CHANGES == "true" ) ]]; then
  SHOULD_RUN=true
else
  SHOULD_RUN=false
fi

echo "SHOULD_RUN: $SHOULD_RUN"

