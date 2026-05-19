---
name: vendor-otel
description: Vendor an OpenTelemetry instrumentation package into the Sentry JavaScript SDK. Use when vendoring, inlining, or copying an @opentelemetry/instrumentation-* package (or similar like @prisma/instrumentation, @fastify/otel) into the SDK source. Also use when the user says "vendor", "inline instrumentation", or references the Vendor OpenTelemetry Instrumentation project.
---

# Vendor OTel Instrumentation

Copy upstream OTel instrumentation TypeScript source into a `vendored/` directory, remove the npm dependency, and ensure builds and tests pass. No logic changes — the vendored code must behave identically to the original.

## 1. Research

### Find upstream source
```bash
gh api "repos/open-telemetry/opentelemetry-js-contrib/git/trees/main?recursive=1" --jq '.tree[].path' | grep "instrumentation-<name>/src/.*\.ts$"
```

### Check versions
- Pinned version: `grep "instrumentation-<name>" packages/node/package.json`
- Latest tag: `gh api repos/open-telemetry/opentelemetry-js-contrib/git/refs/tags --jq '.[].ref' | grep "instrumentation-<name>"`
- Get commit SHA: `gh api repos/open-telemetry/opentelemetry-js-contrib/git/refs/tags/instrumentation-<name>-v<version> --jq '.object.sha'`

### Verify no breaking changes between pinned and latest
**This is critical.** All OTel instrumentations are pre-v1 so any bump could break things. Diff ALL source files:
```bash
diff <(gh api ".../src/<file>?ref=instrumentation-<name>-v<pinned>" --jq '.content' | base64 -d) \
     <(gh api ".../src/<file>?ref=instrumentation-<name>-v<latest>" --jq '.content' | base64 -d)
```
In practice most bumps have zero code changes (only license headers). If there ARE changes, evaluate safety and report to the user before proceeding.

### Check external type imports
```bash
grep "import.*from '" <file> | grep -v "@opentelemetry\|'\./\|@sentry\|'util'\|'path'\|'fs'\|'http'\|'events'"
```
External type imports need special handling (see section 4).

### Check test coverage
- Integration tests: `dev-packages/node-integration-tests/suites/tracing/<name>/`
- E2E tests: `dev-packages/e2e-tests/test-applications/node-<name>/`
- Unit tests: `packages/node/test/integrations/tracing/<name>.test.ts`

Report any gaps to the user (e.g., "no integration test exists for this instrumentation" or "tests exist but don't cover X functionality").

## 2. Directory Structure

Move the integration file into a directory:
- `packages/node/src/integrations/tracing/<name>.ts` → `packages/node/src/integrations/tracing/<name>/index.ts`
- For non-tracing integrations (like `fs.ts`): `packages/node/src/integrations/<name>/index.ts`
- For non-node packages (aws-serverless, nestjs): follow their existing structure
- Create `vendored/` subdirectory for upstream files

Import paths in barrel exports (`index.ts`, `tracing/index.ts`) resolve to the directory's `index.ts` automatically — usually no changes needed.

## 3. Vendoring Source Files

Fetch original TypeScript from the OTel contrib repo (NOT compiled JS from node_modules):
```bash
gh api "repos/open-telemetry/opentelemetry-js-contrib/contents/<path>?ref=<tag>" --jq '.content' | base64 -d
```

**Be careful with header stripping** — `sed '1,Nd'` to remove the SPDX header can accidentally strip import lines. Always verify all imports are present after stripping.

Each vendored file gets this header:
```
/*
 * Copyright The OpenTelemetry Authors
 * ...full Apache 2.0 license text...
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/<sha>/packages/instrumentation-<name>
 * - Upstream version: @opentelemetry/instrumentation-<name>@<version>
 */
/* eslint-disable */
```

Add additional bullets to the NOTICE only when applicable:
- `* - Minor TypeScript strictness adjustments for this repository's compiler settings` — when TS changes were made
- `* - Some types vendored from <package> with simplifications` — when types were inlined

Standard replacements in the main instrumentation file:
- Remove `import { PACKAGE_NAME, PACKAGE_VERSION } from './version'` and the `/** @knipignore */` comment above it
- Add `import { SDK_VERSION } from '@sentry/core'`
- Add `const PACKAGE_NAME = '@sentry/instrumentation-<name>';`
- Replace `PACKAGE_VERSION` with `SDK_VERSION` in the `super()` call

Don't forget barrel exports (`enums/index.ts`, etc.) if the upstream has them.

## 4. External Type Handling

Types from external packages can leak into `.d.ts` output and break consumers.

**Decision tree:**
1. Check if types appear in public class signatures. TypeScript strips private method signatures from `.d.ts`, so private-only usage won't leak.
2. Check if the upstream `types.ts` already vendors some types inline.
3. If types leak or are needed for compilation, **inline simplified types**:
   - Put in a separate `<package>-types.ts` file in vendored/
   - Keep as close to originals as possible — same generic parameters, field names, types
   - Only simplify when the full type tree is too deep
   - Add `[key: string]: any` index signatures for permissiveness
   - Check if package ships own types or uses DefinitelyTyped

4. After building, verify no leaks: `grep "from '<package>'" packages/node/build/types/...`

## 5. TypeScript Strictness Adjustments

The Sentry repo has `strict: true` and `noUncheckedIndexedAccess: true`. Common fixes:
- `<any>` angle-bracket assertions → `as any` (sucrase/esbuild doesn't support angle-bracket syntax)
- Implicit `any` in `.then()`, `.catch()`, `.forEach()`, `.map()` callbacks → add `: any`
- Array indexing `T | undefined` → add `!` non-null assertion or default values
- `ConstructorParameters<typeof X>` constraint failures → replace with `any[]`

Add the TS strictness bullet to the header comment when changes are made.

## 6. Package.json and Lint Config

- Remove the dependency from the relevant `package.json`
- If vendored code imports `@opentelemetry/core` and the package didn't previously have it as a direct dependency, **add it** — rollup auto-externalizes based on `dependencies`, without it the import resolves to a broken relative path
- Add vendored path to the consolidated lint exceptions in `.oxlintrc.base.json`:
```json
"**/integrations/tracing/<name>/vendored/**/*.ts"
```

## 7. Build and Format

```bash
yarn install
npx oxfmt --write <vendored-directory>/
yarn build:dev:filter @sentry/<package>
```

Check `.d.ts` output for type leaks. For `aws-serverless`: needs `preserveModulesRoot: 'src'` in rollup config.

## 8. Test Verification

- Run integration tests: `cd dev-packages/node-integration-tests && yarn test suites/tracing/<name>`
- Run unit tests: `cd packages/node && yarn test:unit test/integrations/tracing/<name>.test.ts`
- **Update test imports**: unit tests importing from `@opentelemetry/instrumentation-<name>` need paths updated to the vendored location, and `vi.mock()` calls updated to match
- Docker-dependent tests (amqplib, kafkajs, redis, postgres) timeout locally but pass in CI
- Version-specific tests: use a local `package.json` in the test directory with unique Docker container names

**Report test coverage gaps to the user** — if an instrumentation has no integration test, no E2E test, or tests don't cover key functionality, flag it.

## 9. Report Changes

**Before submitting, report ALL modifications to the user for verification:**

1. **Files copied as-is** (only header + formatting changes) — list them
2. **TypeScript strictness adjustments** — list each change with file and line context (e.g., "added `: any` to `.catch()` callback parameter")
3. **Type simplifications** — explain what was simplified vs the original and why
4. **Import path changes** — `from 'kafkajs'` → `from './kafkajs-types'` etc.
5. **Any other modifications** — anything beyond the standard vendoring pattern

The user should be able to verify that no logic was changed and all adjustments were strictly necessary.

## 10. PR Creation

- Branch: `nh/vendor-<name>-instrumentation`
- Commit: `ref(node): Vendor <name> instrumentation`
- PR body: one sentence on what was vendored, mention inlined types if applicable, reference closing issue
- Always draft PR, base branch `develop`

## 11. Common Pitfalls

- `sed` header stripping removing import lines — always verify
- `preserveModules: true` shifting output paths with deeply nested vendored files
- Docker container name conflicts between test suites
- `/* eslint-disable */` kept for consistency even though project uses oxlint
- `yarn.lock` duplicates — run `npx yarn-deduplicate yarn.lock`
- `.oxlintrc.base.json` merge conflicts — keep both HEAD and develop entries
