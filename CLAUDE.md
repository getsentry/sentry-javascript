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
- `packages/types/` - Shared TypeScript type definitions
- `packages/browser-utils/` - Browser-specific utilities and instrumentation

### Platform SDKs
- `packages/browser/` - Browser SDK with bundled variants
- `packages/node/` - Node.js SDK with server-side integrations
- `packages/bun/`, `packages/deno/`, `packages/cloudflare/` - Runtime-specific SDKs

### Framework Integrations
- Framework packages follow naming: `packages/{framework}/` (react, vue, angular, etc.)
- Each has client/server entry points where applicable (e.g., nextjs, nuxt, sveltekit)

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

### Key Development Notes
- Uses Volta for Node.js/Yarn version management
- Requires initial `yarn build` after `yarn install` for TypeScript linking
- Integration tests are in separate packages (`dev-packages/`)
- Native profiling requires Python <3.12 for binary builds
- Bundle outputs vary - check `build/bundles/` for specific files after builds

## Testing Single Packages
To test a specific package: `cd packages/{package-name} && yarn test`
To build a specific package: `yarn build:dev:filter @sentry/{package-name}`