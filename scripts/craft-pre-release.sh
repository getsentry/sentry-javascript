#!/bin/bash
set -eux
# Move to the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $SCRIPT_DIR/..
OLD_VERSION="${1}"
NEW_VERSION="${2}"
 # Do not tag and commit changes made by "npm version"
export npm_config_git_tag_version=false
yarn lerna version --exact --no-git-tag-version --no-push -y --include-merged-tags "${NEW_VERSION}"
