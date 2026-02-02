# Oxlint Migration Gaps

This document tracks the ESLint rules that are not natively supported in Oxlint, or have different behavior.

## Migration Summary

| Metric               | Value                                   |
| -------------------- | --------------------------------------- |
| ESLint Version       | 8.57.0                                  |
| Oxlint Version       | 1.43.0                                  |
| Performance (lerna)  | ~12x faster (11s vs ~133s, Nx overhead) |
| Performance (direct) | ~66x faster (0.9s vs ~60s)              |
| Total Files Linted   | 1897                                    |
| Warnings             | 39                                      |
| Errors               | 0                                       |

## Migration Steps Completed

1. Created root `.oxlintrc.json` with base rules from `@sentry-internal/sdk` ESLint config
2. Created `.oxlintrc.json` in each package that `extends` the root config (mirrors ESLint structure)
3. Updated all `package.json` lint scripts from `eslint . --format stylish` to `oxlint .`
4. Updated eslint-disable comments to use Oxlint rule names where needed:
   - `@sentry-internal/sdk/no-skipped-tests` → `jest/no-disabled-tests`
   - `@typescript-eslint/prefer-for-of` → `typescript/prefer-for-of`
5. Fixed actual code issues found:
   - Redundant `type` modifier in imports
   - Missing `import type` in `.d.ts` files

## Rules Status After Re-evaluation

### Downgraded to Warning

| Rule             | Status | Errors if enabled | Reason                                   |
| ---------------- | ------ | ----------------- | ---------------------------------------- |
| `complexity`     | `warn` | 26 errors         | Many functions exceed limit of 20        |
| `no-unused-vars` | `off`  | 22 errors         | Catch params like `e`, `err` not ignored |

### Test File Overrides Not Working from Root

The glob patterns in root `.oxlintrc.json` overrides like `**/test/**` don't work when running from root.
Workaround: Rules for test files need to be disabled globally or in package-specific configs.

## Ignored Files/Directories

These were added to `ignorePatterns` to silence errors in vendored/generated code:

| Package          | Ignored                                       | Reason                    |
| ---------------- | --------------------------------------------- | ------------------------- |
| `replay-worker`  | `examples/worker.js`                          | Vendored/minified code    |
| `profiling-node` | `scripts/**`                                  | Build scripts             |
| Root config      | `dev-packages/e2e-tests/test-applications/**` | External test apps        |
| Root config      | `dev-packages/browser-integration-tests/**`   | Integration test fixtures |

## Unsupported ESLint Plugins/Rules

### @typescript-eslint Rules Not Supported

| Rule                                               | Status     | Notes                                      |
| -------------------------------------------------- | ---------- | ------------------------------------------ |
| `@typescript-eslint/no-inferrable-types`           | Not needed | Was disabled in ESLint config              |
| `@typescript-eslint/typedef`                       | **Gap**    | Enforces type annotations on variables     |
| `@typescript-eslint/member-ordering`               | **Gap**    | Class member ordering enforcement          |
| `@typescript-eslint/naming-convention`             | **Gap**    | Private/protected member underscore prefix |
| `@typescript-eslint/unified-signatures`            | **Gap**    | Prevent unnecessary overloads              |
| `@typescript-eslint/explicit-member-accessibility` | **Gap**    | public/private/protected keywords          |

### eslint-plugin-deprecation

| Rule                      | Status  | Notes                                               |
| ------------------------- | ------- | --------------------------------------------------- |
| `deprecation/deprecation` | Partial | Use `typescript/no-deprecated` with type-aware mode |

### eslint-plugin-import

| Rule                                | Status  | Notes                             |
| ----------------------------------- | ------- | --------------------------------- |
| `import/no-extraneous-dependencies` | **Gap** | Check for undeclared dependencies |
| `import/first`                      | **Gap** | Imports should come first         |
| `import/newline-after-import`       | **Gap** | Newline after import block        |

### eslint-plugin-simple-import-sort

| Rule                         | Status  | Notes                                              |
| ---------------------------- | ------- | -------------------------------------------------- |
| `simple-import-sort/imports` | **Gap** | Import sorting - consider using Prettier or dprint |

### eslint-plugin-jsdoc

| Rule                  | Status  | Notes                         |
| --------------------- | ------- | ----------------------------- |
| `jsdoc/require-jsdoc` | **Gap** | Require JSDoc for public APIs |

### ESLint Core Rules

| Rule             | Status  | Notes                  |
| ---------------- | ------- | ---------------------- |
| `spaced-comment` | **Gap** | Whitespace in comments |

## Custom Sentry Plugin Rules

The `@sentry-internal/eslint-plugin-sdk` contains 6 custom rules. These can be loaded via Oxlint's JS plugins feature.

| Rule                          | Status      | Notes                                           |
| ----------------------------- | ----------- | ----------------------------------------------- |
| `no-eq-empty`                 | **Gap**     | Disallow `=== []` or `=== {}`                   |
| `no-class-field-initializers` | **Gap**     | Disallow class field initializers (bundle size) |
| `no-regexp-constructor`       | **Gap**     | Warn about `new RegExp()` usage                 |
| `no-unsafe-random-apis`       | **Gap**     | Disallow `Math.random()` etc                    |
| `no-focused-tests`            | **Covered** | Use `jest/no-focused-tests`                     |
| `no-skipped-tests`            | **Covered** | Use `jest/no-disabled-tests`                    |

## Type-Aware Linting

Type-aware rules require the `--type-aware` flag and `oxlint-tsgolint` package:

```bash
# Install type-aware package
yarn add -D oxlint-tsgolint

# Run with type-aware rules
yarn lint:oxlint:type-aware
```

Type-aware mode enables additional checks like:

- `typescript/no-floating-promises` (enhanced)
- `typescript/no-unsafe-member-access` (enhanced)
- `typescript/unbound-method` (enhanced)
- `typescript/no-deprecated`
- `typescript/no-base-to-string`
- `typescript/restrict-template-expressions`

**Note**: Type-aware linting requires TypeScript 7+ and may need tsconfig adjustments.

## Recommendations

1. **JS Plugins**: Load the custom Sentry plugin via `jsPlugins` config option for missing rules
2. **Prettier Integration**: Use Prettier for import sorting since `simple-import-sort` is not supported
3. **Type-Aware**: Enable type-aware linting in CI for enhanced TypeScript checks
4. **Re-enable Rules**: Periodically review the "Rules Disabled for Re-evaluation" section

## Performance Comparison

### Full Repo

```
ESLint (full repo via lerna):
  Time: ~133 seconds

Oxlint (full repo via lerna):
  Time: ~11 seconds (mostly Nx orchestration overhead)
  Speedup: ~12x

Oxlint (full repo from root):
  Time: ~500ms
  Speedup: ~250x

Oxlint (full repo with type-aware):
  Time: ~4.7 seconds
  Speedup: ~28x
```

**Note**: The `yarn lint:lerna` command has overhead from Nx orchestration. For fastest results, use `yarn lint:oxlint` which runs Oxlint directly on the entire repo.

### Per-Package Results (Oxlint)

| Package           | Files | Time |
| ----------------- | ----- | ---- |
| `core`            | 365   | 53ms |
| `browser`         | 136   | 55ms |
| `node`            | 105   | 64ms |
| `node-core`       | 101   | 56ms |
| `nextjs`          | 181   | 79ms |
| `sveltekit`       | 63    | 71ms |
| `opentelemetry`   | 58    | 52ms |
| `cloudflare`      | 43    | 45ms |
| `remix`           | 38    | 42ms |
| `react`           | 39    | 49ms |
| `feedback`        | 38    | 48ms |
| `replay-internal` | 152   | 38ms |
| `vue`             | 24    | 48ms |
| `svelte`          | 15    | 52ms |
| `angular`         | 12    | 37ms |

All packages lint in under 100ms with Oxlint.

## References

- [Oxlint Documentation](https://oxc.rs/docs/guide/usage/linter/)
- [Migrate from ESLint](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint.html)
- [Type-Aware Linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [JS Plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
- [Nested Configs](https://oxc.rs/docs/guide/usage/linter/config.html#extend-shared-configs)
