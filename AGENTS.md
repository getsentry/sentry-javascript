# Sentry JavaScript SDK

Monorepo with 40+ packages in `@sentry/*`, managed with Yarn workspaces and Nx.

## Setup

- [Volta](https://volta.sh/) for Node.js/Yarn/PNPM version management
- Requires `VOLTA_FEATURE_PNPM=1`
- After cloning: `yarn install && yarn build`
- Never change Volta, Yarn, or package manager versions unless explicitly asked

## Package Manager

Use **yarn**: `yarn install`, `yarn build:dev`, `yarn test`, `yarn lint`

| Command                               | Purpose                       |
| ------------------------------------- | ----------------------------- |
| `yarn build`                          | Full production build         |
| `yarn build:dev`                      | Dev build (transpile + types) |
| `yarn build:dev:filter @sentry/<pkg>` | Build one package + deps      |
| `yarn build:bundle`                   | Browser bundles only          |
| `yarn test`                           | All unit tests                |
| `yarn verify`                         | Lint + format check           |
| `yarn fix`                            | Format + lint fix             |
| `yarn lint`                           | Lint (Oxlint)                 |
| `yarn lint:fix`                       | Lint + auto-fix (Oxlint)      |
| `yarn format`                         | Format files (Oxfmt)          |
| `yarn format:check`                   | Check formatting (Oxfmt)      |

Single package: `cd packages/<name> && yarn test`

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: <agent model name> <noreply@anthropic.com>
```

## Git Workflow

Uses **Git Flow** (see `docs/gitflow.md`).

- **All PRs target `develop`** (NOT `master`)
- `master` = last released state — never merge directly
- Feature branches: `feat/descriptive-name`
- Never update dependencies, `package.json`, or build scripts unless explicitly asked

## Before Every Commit

1. `yarn format`
2. `yarn lint`
3. `yarn test`
4. `yarn build:dev`
5. NEVER push on `develop`

## Architecture

### Core

- `packages/core/` — Base SDK: interfaces, types, core functionality
- `packages/types/` — Shared types (**deprecated, never modify – instead find types in packages/core**)
- `packages/browser-utils/` — Browser utilities and instrumentation
- `packages/node-core/` — Node core logic (excludes OTel instrumentation)

### Platform SDKs

- `packages/browser/` — Browser SDK + CDN bundles
- `packages/node/` — Node.js SDK (OTel instrumentation on top of node-core)
- `packages/bun/`, `packages/deno/`, `packages/cloudflare/`

### Framework Integrations

- `packages/{framework}/` — React, Vue, Angular, Next.js, Nuxt, SvelteKit, Remix, etc.
- Some have client/server entry points (nextjs, nuxt, sveltekit)

### AI Integrations

- `packages/core/src/tracing/{provider}/` — Core instrumentation
- `packages/node/src/integrations/tracing/{provider}/` — Node.js integration + OTel
- `packages/cloudflare/src/integrations/tracing/{provider}.ts` — Edge runtime
- Use `/add-ai-integration` skill when adding or modifying integrations

### User Experience

- `packages/replay-internal/`, `packages/replay-canvas/`, `packages/replay-worker/` — Session replay
- `packages/feedback/` — User feedback

### Dev Packages (`dev-packages/`)

- `browser-integration-tests/` — Playwright browser tests
- `e2e-tests/` — E2E tests (70+ framework combos)
- `node-integration-tests/` — Node.js integration tests
- `test-utils/` — Shared test utilities
- `rollup-utils/` — Build utilities

## Coding Standards

- Follow existing conventions — check neighboring files
- Only use libraries already in the codebase
- Never expose secrets or keys
- When modifying files, cover all occurrences (including `src/` and `test/`)

## Reference Documentation

- [Span Attributes](https://develop.sentry.dev/sdk/telemetry/attributes.md)
- [Scopes (global, isolation, current)](https://develop.sentry.dev/sdk/telemetry/scopes.md)

## Skills

### E2E Testing

Use `/e2e` skill to run E2E tests. See `.claude/skills/e2e/SKILL.md`

### Security Vulnerabilities

Use `/fix-security-vulnerability` skill for Dependabot alerts. See `.claude/skills/fix-security-vulnerability/SKILL.md`

### Issue Triage

Use `/triage-issue` skill. See `.claude/skills/triage-issue/SKILL.md`

### CDN Bundles

Use `/add-cdn-bundle` skill. See `.claude/skills/add-cdn-bundle/SKILL.md`

### Publishing a Release

Use `/release` skill. See `.claude/skills/release/SKILL.md`

### Dependency Upgrades

Use `/upgrade-dep` skill. See `.claude/skills/upgrade-dep/SKILL.md`

### OpenTelemetry Instrumentation Upgrades

Use `/upgrade-otel` skill. See `.claude/skills/upgrade-otel/SKILL.md`

### AI Integration

Use `/add-ai-integration` skill. See `.claude/skills/add-ai-integration/SKILL.md`
