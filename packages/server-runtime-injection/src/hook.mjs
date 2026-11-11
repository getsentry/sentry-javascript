// The async module hooks handed to `Module.register()` by
// `registerDiagnosticsChannelInjection()` (Node 20.19–24.12 and 25.0, where the stable sync
// `Module.registerHooks` API isn't available).
//
// `Module.register()` loads its target on Node's loader thread, which
// cannot resolve bare specifiers into the dependencies this package
// bundles. This shim is therefore an entrypoint of both builds and shares
// their vendored chunks. The CJS build registers the CJS copy by path. The
// ESM copy is also exposed as `@sentry/server-runtime-injection/hook`.
export * from '@apm-js-collab/tracing-hooks/hook.mjs';
