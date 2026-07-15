---
name: bump-conventions
description: Bump the @sentry/conventions dependency to a new version across every package in the monorepo. Use when upgrading, bumping, or aligning @sentry/conventions, or when a new @sentry/conventions release needs to be pulled into all workspaces.
argument-hint: '[version]  # e.g. 0.16.0; defaults to latest on npm'
---

# Bump `@sentry/conventions`

Bump `@sentry/conventions` across every `package.json` at once, keeping the two pin styles consistent, then refresh `yarn.lock`.

## 1. Determine the target version

If the user gave a version, use it. Otherwise get the latest:

```bash
npm view @sentry/conventions version
```

## 2. Update every declared version

Find every `package.json` that declares `@sentry/conventions` (use the Grep tool so `node_modules` and build output are skipped automatically) and bump each to the new version. There are two pin styles, and **each must keep its style**:

- `packages/*` declare a caret range in `dependencies`, e.g. `"^0.15.1"` → `"^0.16.0"`
- `dev-packages/*` test suites declare an exact pin in `devDependencies`, e.g. `"0.15.1"` → `"0.16.0"`

Edit only the version string; leave the caret alone. If a file declares a version that matches neither the current caret nor the exact pin, list it and confirm with the user before touching it. Preserve each file's trailing newline.

## 3. Refresh the lockfile and build

```bash
yarn install
yarn dedupe-deps:fix
yarn build:dev
```

`yarn install` collapses the combined `yarn.lock` entry (`"@sentry/conventions@<OLD>", "@sentry/conventions@^<OLD>":`) onto the new version. Confirm no stale `<OLD>` resolution remains:

```bash
grep -n '@sentry/conventions@' yarn.lock
```

## 4. Check for breaking API changes

A `conventions` bump can rename or remove exported attribute constants. If `yarn build:dev` fails, inspect the type errors and update usages in `src/` **and** `test/`. Heaviest consumers: `packages/core`, `packages/opentelemetry`, `packages/aws-serverless`.

Use LSP `findReferences` on the changed export to catch every call site. Do not paper over a rename with a cast.

## 5. Final verification

```bash
yarn circularDepCheck
yarn fix
yarn test
```

## Commit

Use the `feat(deps):` prefix the repo uses for dependency bumps:

```
feat(deps): Bump `@sentry/conventions` to <NEW>
```
