#!/bin/sh

# This script prepares the `build` directory for NPM package creation.
# It first copies all non-code files into the `build` directory, including `package.json` which
# is edited via a few `sed` commands. These edits include corrections of paths (e.g. entry points)
# in the copied package.json so that they align with the directory structure inside `build`.

BUILD_DIR=build

ASSETS="README.md
LICENSE
package.json"

# check if build dir exists
if [ ! -d $BUILD_DIR ]; then
  echo "Directory ${BUILD_DIR}/ DOES NOT exist."
  echo "This script should only be executed after you've run \`yarn build\`."
  exit 1
fi

# copy non-code assets to build dir
for f in $ASSETS; do
  cp $f $BUILD_DIR/
done

# package.json modifications

# sed command to modify package.json entry points in build dir
# remove `BUILD_DIR` from `main`, `module` and `type` entry point paths
entryPointsCommand="/\"(main|module|types)\": .*,/s/$BUILD_DIR\///"

# use empty backup file extension for sed in-place editing on MacOS and no backup for other platforms
if [[ $(uname) == "Darwin" ]]; then
  sed -i "" -E "$entryPointsCommand" $BUILD_DIR/package.json
else
  sed -i -E "$entryPointsCommand#" $BUILD_DIR/package.json
fi

echo "Successfully finished postbuild commands"
