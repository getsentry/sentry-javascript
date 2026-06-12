// EXPERIMENTAL — entry point for `node --import @sentry/node/orchestrion app.js`.
//
// Delegates to the shared orchestrion runtime hook in
// `@sentry/server-utils`, which registers the orchestrion ESM loader
// (and CJS `Module.prototype._compile` patch) with the central instrumentation
// config and sets `globalThis.__SENTRY_ORCHESTRION__.runtime`. Kept as a thin
// node-resident shim so the `@sentry/node/orchestrion` subpath keeps working.
import '@sentry/server-utils/orchestrion/import-hook';
