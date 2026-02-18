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
6. Removed all `.eslintrc.js` and `.eslintrc.cjs` files from the codebase (61 files total)

## ESLint Cleanup

All ESLint configuration files have been removed from the codebase:

- Removed 50 `.eslintrc.js` files from packages/, dev-packages/, and root
- Removed 11 `.eslintrc.cjs` files from packages/ and dev-packages/

**Kept**:

- `packages/eslint-config-sdk` - Published ESLint config for SDK users
- `packages/eslint-plugin-sdk` - Published ESLint plugin for SDK users
- ESLint in `dev-packages/e2e-tests/test-applications/*` - These are real framework test apps that use ESLint

**Configuration hierarchy now**:

- `.oxlintrc.json` (root) - Base rules
- `packages/*/.oxlintrc.json` - Extends root, package-specific overrides
- `dev-packages/*/.oxlintrc.json` - Extends root, dev-package-specific overrides

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

| Rule                          | Status  | Notes                                           |
| ----------------------------- | ------- | ----------------------------------------------- |
| `no-eq-empty`                 | **Gap** | Disallow `=== []` or `=== {}`                   |
| `no-class-field-initializers` | **Gap** | Disallow class field initializers (bundle size) |
| `no-regexp-constructor`       | **Gap** | Warn about `new RegExp()` usage                 |
| `no-unsafe-random-apis`       | **Gap** | Disallow `Math.random()` etc                    |

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

### Per-Package Results

Here's the complete comparison table with all packages and dev-packages:

#### SDK Packages

| Package           | Files | ESLint | Oxlint | Speedup  |
| ----------------- | ----- | ------ | ------ | -------- |
| `core`            | 365   | 9.6s   | 53ms   | **181x** |
| `browser`         | 136   | 6.8s   | 55ms   | **124x** |
| `node`            | 105   | 6.1s   | 64ms   | **95x**  |
| `node-core`       | 101   | 6.2s   | 56ms   | **111x** |
| `nextjs`          | 181   | 10.9s  | 79ms   | **138x** |
| `sveltekit`       | 63    | 6.4s   | 71ms   | **90x**  |
| `opentelemetry`   | 58    | 4.3s   | 52ms   | **83x**  |
| `cloudflare`      | 43    | 3.8s   | 45ms   | **84x**  |
| `remix`           | 38    | 7.1s   | 42ms   | **169x** |
| `react`           | 39    | 6.5s   | 49ms   | **133x** |
| `feedback`        | 38    | 3.8s   | 48ms   | **79x**  |
| `replay-internal` | 152   | 5.6s   | 38ms   | **147x** |
| `vue`             | 24    | 4.0s   | 48ms   | **83x**  |
| `svelte`          | 15    | 4.0s   | 52ms   | **77x**  |
| `angular`         | 12    | 3.7s   | 37ms   | **100x** |

#### Dev Packages

| Package                        | Files | ESLint   | Oxlint | Speedup  |
| ------------------------------ | ----- | -------- | ------ | -------- |
| `browser-integration-tests`    | 778   | 10.8s    | 209ms  | **52x**  |
| `node-integration-tests`       | 605   | 9.0s     | 291ms  | **31x**  |
| `node-core-integration-tests`  | 268   | 6.2s     | 74ms   | **84x**  |
| `e2e-tests`                    | 10    | 2.6s     | 44ms   | **59x**  |
| `cloudflare-integration-tests` | 27    | 2.5s     | 35ms   | **71x**  |
| `test-utils`                   | 5     | 2.4s     | 21ms   | **114x** |
| `rollup-utils`                 | 13    | ❌ error | 22ms   | N/A      |
| `bundler-tests`                | 3     | ❌ error | 51ms   | N/A      |

**Average speedup: ~95x faster**

**Average speedup: ~113x faster per package**

All packages lint in under 100ms with Oxlint.

## Next Steps

### Short Term

1. **Address remaining warnings (45)** - Review the `complexity` warnings and consider refactoring functions that exceed the limit of 20
2. **Enable type-aware linting in CI** - Add `yarn lint:oxlint:type-aware` to CI for enhanced TypeScript checks (catches more bugs but slower)
3. **Update pre-commit hooks** - If using husky/lint-staged, update to use `oxlint` instead of `eslint`

### Medium Term

4. **Implement custom Sentry rules via JS plugins** - Port the 4 remaining custom rules from `@sentry-internal/eslint-plugin-sdk`:
   - `no-eq-empty` - Disallow `=== []` or `=== {}`
   - `no-class-field-initializers` - Disallow class field initializers (bundle size)
   - `no-regexp-constructor` - Warn about `new RegExp()` usage
   - `no-unsafe-random-apis` - Disallow `Math.random()` etc
5. **Re-evaluate disabled rules** - Periodically check if `no-unused-vars` can be re-enabled with better catch param handling
6. **Import sorting** - Consider using Prettier or dprint for import sorting since `simple-import-sort` is not supported

### Long Term

7. **Deprecate `eslint-config-sdk` and `eslint-plugin-sdk`** - Once Oxlint adoption is widespread, consider deprecating these packages or providing Oxlint equivalents
8. **Monitor Oxlint releases** - Track new rule support in Oxlint releases that may fill current gaps:
   - `@typescript-eslint/member-ordering`
   - `@typescript-eslint/naming-convention`
   - `import/no-extraneous-dependencies`
   - `jsdoc/require-jsdoc`

## References

- [Oxlint Documentation](https://oxc.rs/docs/guide/usage/linter/)
- [Migrate from ESLint](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint.html)
- [Type-Aware Linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [JS Plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
- [Nested Configs](https://oxc.rs/docs/guide/usage/linter/config.html#extend-shared-configs)
