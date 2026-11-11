// The async module hooks handed to `Module.register()` by
// `registerDiagnosticsChannelInjection()` (Node 18.19–24.12, where the stable sync
// `Module.registerHooks` API isn't available).
//
// `Module.register()` loads its target on Node's ESM loader thread, so the target must be a real,
// on-disk ES module. It is built into a single file that imports only Node builtins (see
// `rollup.npm.config.mjs`), because build tracers ship it without following its imports, and is
// exposed via the `@sentry/server-runtime-injection/hook` subpath.
export * from '@apm-js-collab/tracing-hooks/hook.mjs';
