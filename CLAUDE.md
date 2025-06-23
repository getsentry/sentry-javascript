# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build Commands

- `yarn build` - Full production build with package verification
- `yarn build:dev` - Development build (transpile + types)
- `yarn build:dev:watch` - Development build in watch mode (recommended for development)
- `yarn build:dev:filter <package>` - Build specific package and its dependencies
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

### Package Management

- `yarn clean` - Clean build artifacts and caches
- `yarn clean:deps` - Clean and reinstall all dependencies

## Repository Architecture

This is a Lerna monorepo containing 40+ packages in the `@sentry/*` namespace. Key architectural components:

### Core Packages

- `packages/core/` - Base SDK with interfaces, type definitions, and core functionality
- `packages/types/` - Shared TypeScript type definitions (active)
- `packages/browser-utils/` - Browser-specific utilities and instrumentation

### Platform SDKs

- `packages/browser/` - Browser SDK with bundled variants
- `packages/node/` - Node.js SDK with server-side integrations
- `packages/bun/`, `packages/deno/`, `packages/cloudflare/` - Runtime-specific SDKs

### Framework Integrations

- Framework packages follow naming: `packages/{framework}/` (react, vue, angular, etc.)
- Each has client/server entry points where applicable (e.g., nextjs, nuxt, sveltekit)
- Integration tests use Playwright (e.g., Remix, browser-integration-tests)

### User Experience Packages

- `packages/replay-internal/` - Session replay functionality
- `packages/replay-canvas/` - Canvas recording support for replay
- `packages/replay-worker/` - Web worker support for replay
- `packages/feedback/` - User feedback integration

### Build System

- Uses Rollup for bundling with config files: `rollup.*.config.mjs`
- TypeScript with multiple tsconfig files per package (main, test, types)
- Lerna manages package dependencies and publishing
- Vite for testing with `vitest`

### Package Structure Pattern

Each package typically contains:

- `src/index.ts` - Main entry point
- `src/sdk.ts` - SDK initialization logic
- `rollup.npm.config.mjs` - Build configuration
- `tsconfig.json`, `tsconfig.test.json`, `tsconfig.types.json` - TypeScript configs
- `test/` directory with corresponding test files

### Development Packages (`dev-packages/`)

Separate from main packages, containing development and testing utilities:

- `browser-integration-tests/` - Playwright browser tests
- `e2e-tests/` - End-to-end tests for 70+ framework combinations
- `node-integration-tests/` - Node.js integration tests
- `test-utils/` - Shared testing utilities
- `bundle-analyzer-scenarios/` - Bundle analysis
- `rollup-utils/` - Build utilities
- GitHub Actions packages for CI/CD automation

### Key Development Notes

- Uses Volta for Node.js/Yarn version management
- Requires initial `yarn build` after `yarn install` for TypeScript linking
- Integration tests use Playwright extensively
- Native profiling requires Python <3.12 for binary builds
- Bundle outputs vary - check `build/bundles/` for specific files after builds

## Git Flow Branching Strategy

This repository uses **Git Flow** branching model. See [detailed documentation](docs/gitflow.md).

### Key Points

- **All PRs target `develop` branch** (not `master`)
- `master` represents the last released state
- Never merge directly into `master` (except emergency fixes)
- Automated workflow syncs `master` → `develop` after releases
- Avoid changing `package.json` files on `develop` during pending releases

### Branch Naming

- Features: `feat/descriptive-name`
- Releases: `release/X.Y.Z`

## Code Quality Requirements

**CRITICAL**: This is a production SDK used by thousands of applications. All changes must be:

### Mandatory Checks

- **Always run `yarn lint`** - Fix all linting issues before committing
- **Always run `yarn test`** - Ensure all tests pass
- **Run `yarn build`** - Verify build succeeds without errors

### Before Any Commit

1. `yarn lint` - Check and fix ESLint/Prettier issues
2. `yarn test` - Run relevant tests for your changes
3. `yarn build:dev` - Verify TypeScript compilation

### CI/CD Integration

- All PRs automatically run full lint/test/build pipeline
- Failed checks block merging
- Use `yarn test:pr` for testing only affected changes

## Testing Single Packages

To test a specific package: `cd packages/{package-name} && yarn test`
To build a specific package: `yarn build:dev:filter @sentry/{package-name}`

## Cursor IDE Integration

For Cursor IDE users, see [.cursor/rules/sdk_development.mdc](.cursor/rules/sdk_development.mdc) for complementary development rules.
