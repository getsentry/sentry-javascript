export * from './shared-exports';

// Build-time only: kept off `shared-exports` so it stays out of the `@sentry/core/browser` and
// `@sentry/core/server` entry points, which no build-time code imports.
// TODO(v12): Remove together with the warning itself.
export { warnOnRemovedBuildOptions } from './build-time-plugins/warnOnRemovedBuildOptions';
export * from './server-exports';
export * from './browser-exports';
