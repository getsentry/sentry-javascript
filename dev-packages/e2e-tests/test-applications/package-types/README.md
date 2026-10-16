# Package Types Test

This test "app" checks that the types of all `@sentry/*` packages match their JS files, for Node's `require`, Node's
`import` and bundlers.

- `scripts/check-entries.mjs` checks that the app depends on every published package with types, and that every
  exports entry without types is in `JS_ONLY_ENTRIES`. The other checks skip entries without types.
- `scripts/check-attw.mjs` checks every package with [attw](https://github.com/arethetypeswrong/arethetypeswrong.github.io).
  It fails for a problem that is not in `KNOWN_PROBLEMS`, and for a known problem that attw does not report any more.
- `scripts/check-types.mjs` imports every exports entry that has types, with TypeScript 5.0, 5.9, 6.0 and 7.0, in
  `nodenext`, `bundler` and `node10` mode, and with the `react-native` condition. A default import must be an error
  where the runtime loads an ESM file without a default export, and must be `module.exports` where it loads a CJS file.
- `scripts/check-runtime.mjs` checks that a CJS file sets `__esModule` only if its entry has a default export, and
  runs the fixtures in `src` (see https://github.com/getsentry/sentry-javascript/issues/3105).

The checks need the `overrides` and the `SENTRY_E2E_WORKSPACE_ROOT` variable that the E2E runner adds, so run them
with `pnpm run test:run package-types` in `dev-packages/e2e-tests`.

## How to add a new package

Add the package as a dependency. The checks find its exports entries in its `package.json`.

## How to add an entry

- Entry with types: nothing to do.
- Entry with a default export: add it to `DEFAULT_EXPORT_ENTRIES` in `scripts/entries.mjs`.
- Entry without types (a hook, a loader or a file that a build tool injects): add it to `JS_ONLY_ENTRIES` in
  `scripts/entries.mjs`.
