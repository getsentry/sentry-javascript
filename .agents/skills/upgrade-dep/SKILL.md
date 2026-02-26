---
name: upgrade-dep
description: Upgrade a dependency in the Sentry JavaScript SDK. Use when upgrading packages, bumping versions, or fixing security vulnerabilities via dependency updates.
argument-hint: <package-name>
---

# Dependency Upgrade

**Only upgrade one package at a time.**

## Upgrade command

```bash
npx yarn-update-dependency@latest [package-name]
```

If the dependency is not defined in any `package.json`, run the upgrade from the root workspace (the `yarn.lock` lives there).

Avoid upgrading top-level dependencies (especially test dependencies) without asking the user first.

Ensure updated `package.json` files end with a newline.

## OpenTelemetry constraint

**STOP** if upgrading any `opentelemetry` package would introduce forbidden versions:
- `2.x.x` (e.g., `2.0.0`)
- `0.2xx.x` (e.g., `0.200.0`, `0.201.0`)

Verify before upgrading:

```bash
yarn info <package-name>@<version> dependencies
```

## E2E test dependencies

Do **not** upgrade the major version of a dependency in `dev-packages/e2e-tests/test-applications/*` if the test directory name pins a version (e.g., `nestjs-8` must stay on NestJS 8).

## Post-upgrade verification

```bash
yarn install
yarn build:dev
yarn dedupe-deps:fix
yarn fix
yarn circularDepCheck
```

## Useful commands

```bash
yarn list --depth=0          # Check dependency tree
yarn why [package-name]      # Find why a package is installed
yarn info <pkg> dependencies # Inspect package dependencies
yarn info <pkg> versions     # Check available versions
yarn outdated                # Check outdated dependencies
yarn audit                   # Check for security vulnerabilities
```
