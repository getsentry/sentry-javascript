# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# SDK Development Rules

You are working on the Sentry JavaScript SDK, a critical production SDK used by thousands of applications. Follow these rules strictly.

## Code Quality Requirements (MANDATORY)

**CRITICAL**: All changes must pass these checks before committing:

1. **Always run `yarn lint`** - Fix all linting issues
2. **Always run `yarn test`** - Ensure all tests pass
3. **Always run `yarn build:dev`** - Verify TypeScript compilation

## Development Commands

### Build Commands

- `yarn build` - Full production build with package verification
- `yarn build:dev` - Development build (transpile + types)
- `yarn build:dev:watch` - Development build in watch mode (recommended)
- `yarn build:dev:filter <package>` - Build specific package and dependencies
- `yarn build:types:watch` - Watch mode for TypeScript types only
- `yarn build:bundle` - Build browser bundles only

### Testing

- `yarn test` - Run all unit tests

### Linting and Formatting

- `yarn lint` - Run ESLint and Prettier checks
- `yarn fix` - Auto-fix linting and formatting issues
- `yarn lint:es-compatibility` - Check ES compatibility

## Git Flow Branching Strategy

This repository uses **Git Flow**. See [docs/gitflow.md](docs/gitflow.md) for details.

### Key Rules

- **All PRs target `develop` branch** (NOT `master`)
- `master` represents the last released state
- Never merge directly into `master` (except emergency fixes)
- Avoid changing `package.json` files on `develop` during pending releases
- Never update dependencies, package.json content or build scripts unless explicitly asked for
- When asked to do a task on a set of files, always make sure that all occurences in the codebase are covered. Double check that no files have been forgotten.
- Unless explicitly asked for, make sure to cover all files, including files in `src/` and `test/` directories.

### Branch Naming

- Features: `feat/descriptive-name`
- Releases: `release/X.Y.Z`

## Repository Architecture

This is a Lerna monorepo with 40+ packages in the `@sentry/*` namespace.

### Core Packages

- `packages/core/` - Base SDK with interfaces, type definitions, core functionality
- `packages/types/` - Shared TypeScript type definitions - this is deprecated, never modify this package
- `packages/browser-utils/` - Browser-specific utilities and instrumentation
- `packages/node-core/` - Node Core SDK which contains most of the node-specific logic, excluding OpenTelemetry instrumentation.

### Platform SDKs

- `packages/browser/` - Browser SDK with bundled variants
- `packages/node/` - Node.js SDK. All general Node code should go into node-core, the node package itself only contains OpenTelemetry instrumentation on top of that.
- `packages/bun/`, `packages/deno/`, `packages/cloudflare/` - Runtime-specific SDKs

### Framework Integrations

- Framework packages: `packages/{framework}/` (react, vue, angular, etc.)
- Client/server entry points where applicable (nextjs, nuxt, sveltekit)
- Integration tests use Playwright (Remix, browser-integration-tests)

### User Experience Packages

- `packages/replay-internal/` - Session replay functionality
- `packages/replay-canvas/` - Canvas recording for replay
- `packages/replay-worker/` - Web worker support for replay
- `packages/feedback/` - User feedback integration

### Development Packages (`dev-packages/`)

- `browser-integration-tests/` - Playwright browser tests
- `e2e-tests/` - End-to-end tests for 70+ framework combinations
- `node-integration-tests/` - Node.js integration tests
- `test-utils/` - Shared testing utilities
- `bundle-analyzer-scenarios/` - Bundle analysis
- `rollup-utils/` - Build utilities
- GitHub Actions packages for CI/CD automation

## Development Guidelines

### Build System

- Uses Rollup for bundling (`rollup.*.config.mjs`)
- TypeScript with multiple tsconfig files per package
- Lerna manages package dependencies and publishing
- Vite for testing with `vitest`

### Package Structure Pattern

Each package typically contains:

- `src/index.ts` - Main entry point
- `src/sdk.ts` - SDK initialization logic
- `rollup.npm.config.mjs` - Build configuration
- `tsconfig.json`, `tsconfig.test.json`, `tsconfig.types.json`
- `test/` directory with corresponding test files

### Key Development Notes

- Uses Volta for Node.js/Yarn version management
- Requires initial `yarn build` after `yarn install` for TypeScript linking
- Integration tests use Playwright extensively
- Never change the volta, yarn, or package manager setup in general unless explicitly asked for

### E2E Testing

E2E tests are located in `dev-packages/e2e-tests/` and verify SDK behavior in real-world framework scenarios.

#### How Verdaccio Registry Works

E2E tests use [Verdaccio](https://verdaccio.org/), a lightweight npm registry running in Docker. Before tests run:

1. SDK packages are built and packed into tarballs (`yarn build && yarn build:tarball`)
2. Tarballs are published to Verdaccio at `http://127.0.0.1:4873`
3. Test applications install packages from Verdaccio instead of public npm

#### The `.npmrc` Requirement

Every E2E test application needs an `.npmrc` file with:

```
@sentry:registry=http://127.0.0.1:4873
@sentry-internal:registry=http://127.0.0.1:4873
```

Without this file, pnpm installs from the public npm registry instead of Verdaccio, so your local changes won't be tested. This is a common cause of "tests pass in CI but fail locally" or vice versa.

#### Running a Single E2E Test

Run the e2e skill.

#### Common Pitfalls and Debugging

1. **Missing `.npmrc`**: Most common issue. Always verify the test app has the correct `.npmrc` file.

2. **Stale tarballs**: After SDK changes, must re-run `yarn build:tarball`.

3. **Debugging tips**:
   - Check browser console logs for SDK initialization errors
   - Use `debug: true` in Sentry config
   - Verify installed package version: check `node_modules/@sentry/*/package.json`

### Notes for Background Tasks

- Make sure to use [volta](https://volta.sh/) for development. Volta is used to manage the node, yarn and pnpm version used.
- Make sure that [PNPM support is enabled in volta](https://docs.volta.sh/advanced/pnpm). This means that the `VOLTA_FEATURE_PNPM` environment variable has to be set to `1`.
- Yarn, Node and PNPM have to be used through volta, in the versions defined by the volta config. NEVER change any versions unless explicitly asked to.

## Testing Single Packages

- Test specific package: `cd packages/{package-name} && yarn test`
- Build specific package: `yarn build:dev:filter @sentry/{package-name}`

## Code Style Rules

- Follow existing code conventions in each package
- Check imports and dependencies - only use libraries already in the codebase
- Look at neighboring files for patterns and style
- Never introduce code that exposes secrets or keys
- Follow security best practices

## Before Every Commit Checklist

1. ✅ `yarn lint` (fix all issues)
2. ✅ `yarn test` (all tests pass)
3. ✅ `yarn build:dev` (builds successfully)
4. ✅ Target `develop` branch for PRs (not `master`)

## Documentation Sync

**IMPORTANT**: When editing CLAUDE.md, also update .cursor/rules/sdk_development.mdc and vice versa to keep both files in sync.
