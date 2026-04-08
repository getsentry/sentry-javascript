---
name: add-cdn-bundle
description: Create a new CDN bundle for the browser package with specified features
argument-hint: <feature-combo> (e.g., replay.logs.metrics, tracing.logs, tracing.replay.feedback.logs.metrics)
---

# Add CDN Bundle Skill

This skill creates a new CDN bundle for the browser package that includes a specific combination of features.

## Input

The user provides a feature combination using dot notation:

- `logs.metrics` - Bundle with logs and metrics
- `replay.logs.metrics` - Bundle with replay, logs, and metrics
- `tracing.replay.logs` - Bundle with tracing, replay, and logs
- `tracing.replay.feedback.logs.metrics` - Full featured bundle

**Feature order in bundle names:** `tracing` → `replay` → `feedback` → `logs` → `metrics`

## Instructions

Follow the detailed guide at [docs/adding-cdn-bundle.md](../../../docs/adding-cdn-bundle.md) to create the bundle.

### Quick Reference - Naming Conventions

Given a feature combination, derive these variants:

| Placeholder                     | Example (`replay.logs.metrics`) |
| ------------------------------- | ------------------------------- |
| `{FEATURE_COMBO}`               | `replay.logs.metrics`           |
| `{feature_combo}`               | `replay_logs_metrics`           |
| `{featureCombo}`                | `replayLogsMetrics`             |
| `{Human Readable Features}`     | `Replay, Logs, Metrics`         |
| `{Human Readable Feature List}` | `Replay, Logs, and Metrics`     |

### Quick Reference - Files to Create/Modify

1. **Create** `packages/browser/src/index.bundle.{FEATURE_COMBO}.ts`
2. **Create** `packages/browser/test/index.bundle.{FEATURE_COMBO}.test.ts`
3. **Modify** `packages/browser/rollup.bundle.config.mjs`
4. **Modify** `.size-limit.js`
5. **Modify** `dev-packages/browser-integration-tests/package.json`
6. **Modify** `dev-packages/browser-integration-tests/utils/generatePlugin.ts`
7. **Modify** `.github/workflows/build.yml`

### Verification Steps

After making changes:

```bash
yarn lint
cd packages/browser && yarn build:dev
cd packages/browser && yarn test
```
