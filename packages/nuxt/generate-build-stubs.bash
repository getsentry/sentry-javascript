# The Nuxt package is built in 2 steps and the nuxt-module-builder shows a warning if one of the files specified in the package.json is missing.
# unbuild checks for this: https://github.com/unjs/unbuild/blob/8c647ec005a02f852e56aeef6076a35eede17df1/src/validate.ts#L81

# The runtime folder (which is built with the nuxt-module-builder) is separate from the rest of the package and therefore we can ignore those warnings
# as those files are generated in the other build step.

# Create the directories if they do not exist
mkdir -p build/cjs
mkdir -p build/esm
mkdir -p build/types

# Write files if they do not exist
[ ! -f build/cjs/index.server.js ] && echo "module.exports = {}" > build/cjs/index.server.js
[ ! -f build/cjs/index.client.js ] && echo "module.exports = {}" > build/cjs/index.client.js
[ ! -f build/esm/index.server.js ] && echo "export {}" > build/esm/index.server.js
[ ! -f build/esm/index.client.js ] && echo "export {}" > build/esm/index.client.js
[ ! -f build/types/index.types.d.ts ] && echo "export {}" > build/types/index.types.d.ts

echo "Created build stubs for missing files"
