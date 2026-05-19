---
name: vendor-otel
description: Vendor an OpenTelemetry instrumentation package into the Sentry JavaScript SDK. Use when vendoring, inlining, or copying an @opentelemetry/instrumentation-* package (or similar like @prisma/instrumentation, @fastify/otel) into the SDK source. Also use when the user says "vendor", "inline instrumentation", or references the Vendor OpenTelemetry Instrumentation project.
---

# Vendor OTel Instrumentation

**Input:** The npm package name to vendor (e.g., `@opentelemetry/instrumentation-graphql`).

Copy upstream OTel instrumentation TypeScript source into a `vendored/` directory, remove the npm dependency, and ensure builds and tests pass. No logic changes — the vendored code must behave identically to the original.

## 1. Research

Find upstream source files:

```bash
gh api "repos/open-telemetry/opentelemetry-js-contrib/git/trees/main?recursive=1" --jq '.tree[].path' | grep "instrumentation-<name>/src/.*\.ts$"
```

Check versions:

- Pinned: `grep "instrumentation-<name>" packages/node/package.json`
- Latest tag: `gh api repos/open-telemetry/opentelemetry-js-contrib/git/refs/tags --jq '.[].ref' | grep "instrumentation-<name>"`
- Commit SHA: `gh api repos/open-telemetry/opentelemetry-js-contrib/git/refs/tags/instrumentation-<name>-v<version> --jq '.object.sha'`

**Diff ALL source files between pinned and latest version.** All OTel instrumentations are pre-v1 so any bump could introduce breaking changes. Report findings to the user.

Check for external type imports (these need special handling, see section 5):

```bash
grep "import.*from '" <file> | grep -v "@opentelemetry\|'\./\|@sentry\|'util'\|'path'\|'fs'\|'http'\|'events'"
```

Check test coverage and report gaps:

- Integration tests: `dev-packages/node-integration-tests/suites/tracing/<name>/`
- E2E tests: `dev-packages/e2e-tests/test-applications/node-<name>/`
- Unit tests: `packages/node/test/integrations/tracing/<name>.test.ts`

## 2. Plan

Present a plan to the user covering:

- Which version to vendor (pinned vs latest, with diff summary)
- Source files to copy
- External types that need inlining
- Test coverage status
- Any concerns

**Stop here and wait for explicit user approval before implementing.** Use AskUserQuestion to confirm the plan.

## 3. Directory Structure

- `packages/node/src/integrations/tracing/<name>.ts` → `packages/node/src/integrations/tracing/<name>/index.ts`
- For non-tracing integrations (like `fs.ts`): `packages/node/src/integrations/<name>/index.ts`
- For non-node packages (aws-serverless, nestjs): follow their existing structure
- Create `vendored/` subdirectory for upstream files

## 4. Vendor Source Files

Fetch original TypeScript from the OTel contrib GitHub repo (NOT compiled JS from node_modules):

```bash
gh api "repos/open-telemetry/opentelemetry-js-contrib/contents/<path>?ref=<tag>" --jq '.content' | base64 -d
```

When stripping the upstream SPDX header, verify all import lines are still present afterward.

Each vendored file gets the full Apache 2.0 license header plus:

```
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/<sha>/packages/instrumentation-<name>
 * - Upstream version: @opentelemetry/instrumentation-<name>@<version>
```

Add bullets for TS adjustments or type vendoring only when applicable.

Append `/* eslint-disable */` after the header block.

Standard replacements in the main instrumentation file:

- Remove `import { PACKAGE_NAME, PACKAGE_VERSION } from './version'`
- Add `import { SDK_VERSION } from '@sentry/core'` and `const PACKAGE_NAME = '@sentry/instrumentation-<name>';`
- Replace `PACKAGE_VERSION` with `SDK_VERSION` in the `super()` call

Include barrel exports (`enums/index.ts`, etc.) if the upstream has them.

## 5. External Type Handling

Types from external packages can leak into `.d.ts` output and break consumers.

**When to inline vs. leave as-is:**

- `import type * as X from '<instrumented-package>'` (e.g., `tedious`, `dataloader`, `generic-pool`) — **do NOT inline**. The instrumented package is always in the user's `node_modules` (otherwise the instrumentation wouldn't run), so its types are guaranteed to be available.
- `import type ... from '@types/<pkg>'` or types from packages that are NOT the instrumented package itself (e.g., `@types/connect`, `@types/koa`, `@types/amqplib`) — **inline these**. Users may not have the `@types/*` package installed.

**How to inline:**

1. Check if the upstream `types.ts` already vendors some types inline.
2. Put inlined types in a separate `<package>-types.ts` or `internal-types.ts` file in vendored/
3. Keep as close to originals as possible — same generic parameters, field names, types
4. Only include members actually accessed by the instrumentation
5. Only simplify when the full type tree is too deep
6. Add `[key: string]: any` index signatures for permissiveness
7. After building, verify no leaks: `grep "from '<package>'" packages/node/build/types/...`

## 6. TypeScript Adjustments

Fix any compilation errors caused by this repository's strict TypeScript settings (`strict: true`, `noUncheckedIndexedAccess: true`). Add a `Minor TypeScript strictness adjustments` bullet to the header when changes are made.

## 7. Package.json and Lint Config

- Remove the dependency from the relevant `package.json`
- If vendored code imports a package (e.g., `@opentelemetry/core`) that isn't a direct dependency, add it — rollup auto-externalizes based on `dependencies`
- Add vendored path to the consolidated lint exceptions in `.oxlintrc.base.json`

## 8. Build, Format, and Test

```bash
yarn install
yarn fix
yarn build:dev:filter @sentry/<package>
```

Verify no external types leak into `.d.ts` output.

Run existing tests:

- `cd dev-packages/node-integration-tests && yarn test suites/tracing/<name>`
- `cd packages/node && yarn test:unit test/integrations/tracing/<name>.test.ts`

Update unit test imports from `@opentelemetry/instrumentation-<name>` to the vendored path, including `vi.mock()` calls.

## 9. Report Changes

Before submitting, report ALL modifications to the user:

1. **Files copied as-is** (only header + formatting)
2. **TypeScript adjustments** — each change with file and line context
3. **Type simplifications** — what was simplified and why
4. **Import path changes**
5. **Any other modifications**

## 10. PR Creation

**After reporting changes, ask the user if they want to proceed with creating the draft PR.** Use AskUserQuestion to confirm.

- Branch: `vendor-<name>-instrumentation`
- Commit: `ref(node): Vendor <name> instrumentation`
- PR description: one or two concise sentences — what was vendored and any notable details (e.g., inlined types). Reference a closing issue if applicable. Example: "Vendors @opentelemetry/instrumentation-kafkajs into the SDK with no logic changes. Types from kafkajs are inlined as simplified interfaces to avoid requiring the package as a dependency.\n\nCloses #20151"
- Always draft PR, base branch `develop`
