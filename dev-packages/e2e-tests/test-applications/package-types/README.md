# Package Types Test

This test "app" checks that the types of all `@sentry/*` packages match their JS files, for Node's `require`, Node's
`import` and bundlers.

- `scripts/check-attw.mjs` checks every package with [attw](https://github.com/arethetypeswrong/arethetypeswrong.github.io).
  It fails for a problem that is not in `KNOWN_PROBLEMS`, and for a known problem that attw does not report any more.
- `scripts/check-types.mjs` imports every exports entry that has types, with TypeScript 5.0, 5.9, 6.0 and 7.0, in
  `nodenext`, `bundler` and `node10` mode. A default import must be an error where the runtime loads an ESM file
  without a default export, and must be `module.exports` where it loads a CJS file.
- `scripts/check-runtime.mjs` checks that a CJS file sets `__esModule` only if its entry has a default export, and
  runs the fixtures in `src` (see https://github.com/getsentry/sentry-javascript/issues/3105).

## How to add a new package

Add the package as a dependency. The checks find its exports entries in its `package.json`.

## How to add an entry with a default export

Add the entry to `DEFAULT_EXPORT_ENTRIES` in `scripts/entries.mjs`.
