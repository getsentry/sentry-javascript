// The async module hooks handed to `Module.register()` by
// `registerDiagnosticsChannelInjection()` (Node 18.19–24.12, where the stable sync
// `Module.registerHooks` API isn't available).
//
// `Module.register()` loads its target on Node's ESM loader thread, so the target must be a real,
// on-disk ES module graph — the loader thread cannot resolve bare specifiers into the dependency
// graph this package bundles away, but it can follow relative imports. This shim is therefore an
// entrypoint of the regular ESM build (sharing the vendored dependency chunks) and exposed via the
// `@sentry/server-utils/orchestrion/hook` subpath.
export * from '@apm-js-collab/tracing-hooks/hook.mjs';
