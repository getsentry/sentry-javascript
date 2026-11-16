#!/bin/sh
set -eu

version=$(jq -e -r '.devEngines.runtime.version' package.json)
cache_path="$RUNNER_TOOL_CACHE/node/$version"
cache_key="node-toolcache-$RUNNER_OS-$RUNNER_ARCH-$version"

printf 'version=%s\ncache-path=%s\ncache-key=%s\n' "$version" "$cache_path" "$cache_key" >> "$GITHUB_OUTPUT"
