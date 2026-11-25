// The Nitro plugin that `sentryNitro()` injects is a virtual module, so its imports resolve from the app's root.
// Under pnpm, the transitive `@sentry/server-utils` only resolves from inside `@sentry/node`, so the plugin
// imports it through this entry, which also keeps the build-time module out of the server bundle.
export { setupSentryNitroApp } from '@sentry/server-utils';
