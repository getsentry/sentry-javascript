# Sentry JavaScript SDK

This is the official Sentry JavaScript SDK monorepo — a critical production SDK used by thousands of applications. It contains 40+ packages in the `@sentry/*` namespace, managed with Yarn workspaces and Nx.

## Setup

- Uses [Volta](https://volta.sh/) for Node.js/Yarn/PNPM version management
- Requires `VOLTA_FEATURE_PNPM=1` environment variable for PNPM support
- After cloning: `yarn install && yarn build` (initial build required for TypeScript linking)
- Never change Volta, Yarn, or package manager versions unless explicitly asked

## Build & Test Commands

- `yarn build` — Full production build with package verification
- `yarn build:dev` — Development build (transpile + types)
- `yarn build:dev:filter @sentry/<package>` — Build specific package and dependencies
- `yarn build:bundle` — Build browser bundles only
- `yarn test` — Run all unit tests
- `yarn lint` — Run ESLint and Oxfmt checks
- `yarn fix` — Auto-fix linting and formatting issues
- `yarn format` — Auto-fix formatting with Oxfmt

### Testing a Single Package

```bash
cd packages/<package-name> && yarn test
yarn build:dev:filter @sentry/<package-name>
```

### E2E Testing

E2E tests live in `dev-packages/e2e-tests/` and use [Verdaccio](https://verdaccio.org/) (local npm registry in Docker). Every test application needs an `.npmrc` file:

```
@sentry:registry=http://127.0.0.1:4873
@sentry-internal:registry=http://127.0.0.1:4873
```

```bash
yarn build && yarn build:tarball   # Build and pack tarballs
cd dev-packages/e2e-tests
yarn test:run <app-name>           # Run a specific test app
```

Common pitfalls: missing `.npmrc` (most common), stale tarballs (re-run `yarn build:tarball` after changes).

To run E2E tests, prefer using the `/e2e` skill which handles building and running automatically.

## Architecture

### Core Packages

- `packages/core/` — Base SDK: interfaces, type definitions, core functionality
- `packages/types/` — Shared TypeScript types (**deprecated — never modify**)
- `packages/browser-utils/` — Browser-specific utilities and instrumentation
- `packages/node-core/` — Node core logic (excluding OpenTelemetry instrumentation)

### Platform SDKs

- `packages/browser/` — Browser SDK with CDN bundle variants
- `packages/node/` — Node.js SDK (OpenTelemetry instrumentation on top of node-core; general Node code goes in node-core)
- `packages/bun/`, `packages/deno/`, `packages/cloudflare/` — Runtime-specific SDKs

### Framework Integrations

- `packages/{framework}/` — React, Vue, Angular, Next.js, Nuxt, SvelteKit, Remix, etc.
- Some have client/server entry points (nextjs, nuxt, sveltekit)

### AI Integrations

- `packages/core/src/tracing/{provider}/` — Core instrumentation logic (OpenAI, Anthropic, Vercel AI, LangChain, etc.)
- `packages/node/src/integrations/tracing/{provider}/` — Node.js-specific integration + OTel instrumentation
- `packages/cloudflare/src/integrations/tracing/{provider}.ts` — Edge runtime support
- Patterns: OTEL Span Processors, Client Wrapping, Callback/Hook Based

### User Experience Packages

- `packages/replay-internal/` — Session replay
- `packages/replay-canvas/` — Canvas recording for replay
- `packages/replay-worker/` — Web worker support for replay
- `packages/feedback/` — User feedback integration

### Development Packages (`dev-packages/`)

- `browser-integration-tests/` — Playwright browser tests
- `e2e-tests/` — E2E tests for 70+ framework combinations
- `node-integration-tests/` — Node.js integration tests
- `test-utils/` — Shared testing utilities
- `rollup-utils/` — Build utilities

### Package Structure Pattern

Each package typically contains:

- `src/index.ts` — Main entry point
- `src/sdk.ts` — SDK initialization logic
- `rollup.npm.config.mjs` — Build configuration
- `tsconfig.json`, `tsconfig.test.json`, `tsconfig.types.json`
- `test/` directory with corresponding test files

## Build System

- Rollup for bundling (`rollup.*.config.mjs`)
- TypeScript with multiple tsconfig files per package
- Nx for task orchestration and caching
- Vitest for unit testing

## Git Workflow

This repository uses **Git Flow** (see `docs/gitflow.md`).

- **All PRs target the `develop` branch** (NOT `master`)
- `master` represents the last released state — never merge directly into it
- Feature branches: `feat/descriptive-name`
- Release branches: `release/X.Y.Z`
- Avoid changing `package.json` on `develop` during pending releases
- Never update dependencies, `package.json` content, or build scripts unless explicitly asked

## Coding Standards

- Follow existing code conventions in each package
- Check imports and dependencies — only use libraries already in the codebase
- Look at neighboring files for patterns and style
- Never introduce code that exposes secrets or keys
- When modifying a set of files, ensure all occurrences in the codebase are covered (including `src/` and `test/` directories)

## Before Every Commit

1. `yarn format` — fix formatting
2. `yarn lint` — fix linting
3. `yarn test` — all tests pass
4. `yarn build:dev` — builds successfully
5. NEVER push on develop
6. Target `develop` branch for PRs
