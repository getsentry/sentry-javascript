// Loaded BEFORE the scenario (via `--import` in ESM mode, `--require` in CJS
// mode). Pulling in `@sentry/node/orchestrion` triggers the runtime channel
// injection: the ESM build calls `module.register()` to install the
// orchestrion loader; the CJS build patches `Module.prototype._compile`.
//
// `createEsmAndCjsTests` converts this file's `import` statements to `require()`
// for the CJS variant by string substitution — the import specifier is
// unchanged. The `./orchestrion` subpath export resolves to a different file
// under the two conditions (`import` → import-hook.mjs, `require` →
// require-hook.cjs), so the same instrument file works in both modes.
import '@sentry/node/orchestrion';
