# TODO: Investigate the need for this script periodically and remove once these modules are correctly resolved.

# This script copies `import-in-the-middle` and `@sentry/solidstart` from the E2E test project root `node_modules`
# to the nitro server build output `node_modules` as these are not properly resolved in our yarn workspace/pnpm
# e2e structure. Some files like `hook.mjs` and `@sentry/solidstart/solidrouter.server.js` are missing. This is
# not reproducible in an external project (when pinning `@vercel/nft` to `v0.27.0` and higher).
cp -r node_modules/.pnpm/import-in-the-middle@1.*/node_modules/import-in-the-middle .output/server/node_modules
cp -rL node_modules/@sentry/solidstart .output/server/node_modules/@sentry
