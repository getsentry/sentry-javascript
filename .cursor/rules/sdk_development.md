---
description: Guidelines for working on the Sentry JavaScript SDK monorepo
alwaysApply: true
---

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
- `yarn test` - Run all tests (excludes integration tests)
- `yarn test:unit` - Run unit tests only
- `yarn test:pr` - Run tests affected by changes (CI mode)
- `yarn test:pr:browser` - Run affected browser-specific tests
- `yarn test:pr:node` - Run affected Node.js-specific tests

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

### Branch Naming
- Features: `feat/descriptive-name`
- Releases: `release/X.Y.Z`

## Repository Architecture

This is a Lerna monorepo with 40+ packages in the `@sentry/*` namespace.

### Core Packages
- `packages/core/` - Base SDK with interfaces, type definitions, core functionality
- `packages/types/` - Shared TypeScript type definitions (active)
- `packages/browser-utils/` - Browser-specific utilities and instrumentation

### Platform SDKs
- `packages/browser/` - Browser SDK with bundled variants
- `packages/node/` - Node.js SDK with server-side integrations
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
- Native profiling requires Python <3.12 for binary builds

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
**IMPORTANT**: When editing CLAUDE.md, also update .cursor/rules/sdk_development.md and vice versa to keep both files in sync.