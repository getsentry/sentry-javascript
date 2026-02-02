# Oxlint Migration Gaps

This document tracks the ESLint rules that are not natively supported in Oxlint, or have different behavior.

## Migration Summary

| Metric                  | Value                                     |
| ----------------------- | ----------------------------------------- |
| ESLint Version          | 8.57.0                                    |
| Oxlint Version          | 1.43.0                                    |
| Performance Improvement | ~330x faster (24ms vs ~8s for same files) |
| Total Files Linted      | 1953                                      |
| Rules Active            | 93+                                       |

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

| Rule                    | Status  | Notes                                       |
| ----------------------- | ------- | ------------------------------------------- |
| `max-lines`             | **Gap** | File size limit (300 lines)                 |
| `spaced-comment`        | **Gap** | Whitespace in comments                      |
| `no-restricted-globals` | **Gap** | Restrict window/document/location/navigator |

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

## Current Errors Found by Oxlint

As of migration, Oxlint identifies the following issues that ESLint may not have caught:

### Complexity Issues (21 functions)

Functions exceeding cyclomatic complexity of 20:

- `getNotificationAttributes` (31)
- `constructor` in replay integration (32)
- `xhrCallback` (27)
- `_INTERNAL_captureLog` (28)
- And others...

### Unused Variables

- Unused catch parameters not prefixed with `_`
- Unused function declarations

### Code Quality

- Bitwise operations (intentionally used in replay packages)
- Missing return types on some callback functions

## Recommendations

1. **JS Plugins**: Load the custom Sentry plugin via `jsPlugins` config option
2. **Prettier Integration**: Use Prettier for import sorting since `simple-import-sort` is not supported
3. **Type-Aware**: Enable type-aware linting in CI for enhanced TypeScript checks
4. **Fix Incrementally**: Address the 71+ errors found by Oxlint over time

## Performance Comparison

```
ESLint (packages/core + packages/browser):
  Time: ~8 seconds

Oxlint (same files):
  Time: 24ms
  Speedup: ~330x
```

## References

- [Oxlint Documentation](https://oxc.rs/docs/guide/usage/linter/)
- [Migrate from ESLint](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint.html)
- [Type-Aware Linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [JS Plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
