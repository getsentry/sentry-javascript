# Add CDN Bundle for `{FEATURE_COMBO}`

Create a new CDN bundle for the browser package that includes `{FEATURE_COMBO}` (e.g., `replay.logs.metrics`, `tracing.logs`, etc.).

## Instructions

Follow the detailed guide at [docs/adding-cdn-bundle.md](../../docs/adding-cdn-bundle.md) to create the bundle.

## Quick Reference - Naming Conventions

| Placeholder                     | Example (`replay.logs.metrics`) |
| ------------------------------- | ------------------------------- |
| `{FEATURE_COMBO}`               | `replay.logs.metrics`           |
| `{feature_combo}`               | `replay_logs_metrics`           |
| `{featureCombo}`                | `replayLogsMetrics`             |
| `{Human Readable Features}`     | `Replay, Logs, Metrics`         |
| `{Human Readable Feature List}` | `Replay, Logs, and Metrics`     |

## Quick Reference - Files to Create/Modify

1. **Create** `packages/browser/src/index.bundle.{FEATURE_COMBO}.ts`
2. **Create** `packages/browser/test/index.bundle.{FEATURE_COMBO}.test.ts`
3. **Modify** `packages/browser/rollup.bundle.config.mjs`
4. **Modify** `.size-limit.js`
5. **Modify** `dev-packages/browser-integration-tests/package.json`
6. **Modify** `dev-packages/browser-integration-tests/utils/generatePlugin.ts`
7. **Modify** `.github/workflows/build.yml`

## Verification Steps

After making changes:

1. Run `yarn lint` to check for linting issues
2. Run `cd packages/browser && yarn build:dev` to verify TypeScript compilation
3. Run `cd packages/browser && yarn test` to run the unit tests
