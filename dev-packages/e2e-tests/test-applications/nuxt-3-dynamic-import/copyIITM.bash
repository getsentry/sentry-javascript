# This script copies the `import-in-the-middle` content of the E2E test project root `node_modules` to the build output `node_modules`
# For some reason, some files are missing in the output (like `hook.mjs`) and this is not reproducible in external, standalone projects.
#
# Things we tried (that did not fix the problem):
# - Adding a resolution for `@vercel/nft` v0.27.0 (this worked in the standalone project)
# - Also adding `@vercel/nft` v0.27.0 to pnpm `peerDependencyRules`
cp -r node_modules/.pnpm/import-in-the-middle@1.*/node_modules/import-in-the-middle .output/server/node_modules/import-in-the-middle
