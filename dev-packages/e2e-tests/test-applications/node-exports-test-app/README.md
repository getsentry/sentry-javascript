# Consistent Node Export Test

This test "app" ensures that we consistently re-export exports from `@sentry/node` in packages depending on
`@sentry/node`.

## How to add new package

1. Add package as a dependency to the test app
2. In `scripts/consistentExports.ts`:
   - add namespace import
   - add `DEPENDENTS` entry
   - add any ignores/exclusion entries as necessary
   - if the package is still under development, you can also set `skip: true`

## Limitations:

- This script only checks top-level exports for now (e.g. `metrics` but no sub-exports like `metrics.increment`)
- This script only checks ESM transpiled code for now, not CJS
