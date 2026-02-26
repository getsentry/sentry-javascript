---
name: upgrade-otel
description: Upgrade OpenTelemetry instrumentations across the Sentry JavaScript SDK. Use when bumping OTel instrumentation packages to their latest versions.
argument-hint: ""
---

# Upgrading OpenTelemetry Instrumentations

**All upgrades must be free of breaking changes.** Read each changelog before proceeding.

## 1. `packages/**`

Upgrade in this order:

1. **`@opentelemetry/instrumentation`** to latest. Check changelog: `https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/CHANGELOG.md`
2. **All `@opentelemetry/instrumentation-*` packages.** Check each changelog: `https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/packages/instrumentation-{name}/CHANGELOG.md`
3. **Third-party instrumentations** (currently `@prisma/instrumentation`). Check their changelogs.

**STOP** if any upgrade introduces breaking changes — fail with the reason.

## 2. `dev-packages/**`

- If an app depends on `@opentelemetry/instrumentation` >= `0.200.x`, upgrade to latest.
- If an app depends on `@opentelemetry/instrumentation-http` >= `0.200.x`, upgrade to latest.

Same rule: no breaking changes allowed.

## 3. Regenerate lock file

```bash
yarn install
```
