---
name: upgrade-dep
description: Upgrade a dependency in the Sentry JavaScript SDK. Use when upgrading packages, bumping versions, or fixing security vulnerabilities via dependency updates.
argument-hint: <package-name>
---

# Dependency Upgrade

**Only upgrade one package at a time.**

## Upgrade command

```bash
pnpm update -r --include-workspace-root --latest [package-name]
```

If the dependency is not defined in any `package.json`, run `pnpm update -r <package-name>` without `--latest`. It updates the transitive copies within their allowed ranges in `pnpm-lock.yaml`.

Avoid upgrading top-level dependencies (especially test dependencies) without asking the user first.

Ensure updated `package.json` files end with a newline.

## OpenTelemetry constraint

**STOP** if upgrading any `opentelemetry` package would introduce forbidden versions:

- `2.x.x` (e.g., `2.0.0`)
- `0.2xx.x` (e.g., `0.200.0`, `0.201.0`)

Verify before upgrading:

```bash
npm view <package-name>@<version> dependencies
```

## E2E test dependencies

Do **not** upgrade the major version of a dependency in `dev-packages/e2e-tests/test-applications/*` if the test directory name pins a version (e.g., `nestjs-8` must stay on NestJS 8).

## Post-upgrade verification

```bash
pnpm install
pnpm run build:dev
pnpm run dedupe-deps:fix
pnpm run fix
pnpm run circularDepCheck
```

## Useful commands

Run them at the repo root. Without `-r`, `pnpm list`, `pnpm why` and `pnpm outdated` only check the root `package.json`.

```bash
pnpm list -r --depth=0       # Check the direct dependencies of all workspace packages
pnpm why -r [package-name]   # Find why a package is installed
npm view <pkg> dependencies  # Inspect package dependencies
npm view <pkg> versions      # Check available versions
pnpm outdated -r             # Check outdated dependencies
pnpm audit                   # Check for security vulnerabilities
```
