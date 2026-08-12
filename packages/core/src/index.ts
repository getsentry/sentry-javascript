export * from './shared-exports';

// Build-time only: kept off `shared-exports` so it stays out of the `@sentry/core/browser` and
// `@sentry/core/server` entry points, which no build-time code imports.
// TODO(v12): Remove together with the warning itself.
export { warnOnRemovedBuildOptions } from './build-time-plugins/warnOnRemovedBuildOptions';
export * from './server-exports';
export * from './browser-exports';

// `server-exports` and `browser-exports` both export these names (plain vs. browser-guarded
// variants). Explicit re-exports shadow the otherwise-ambiguous star exports and pin the root entry
// to the plain/server variants. Without them, importing any of these from `@sentry/core` is a
// link-time `SyntaxError: ... contains conflicting star exports`.
export { startSpan, startInactiveSpan, startSpanManual } from './tracing/trace';
export { startIdleSpan } from './tracing/idleSpan';
export { spanStreamingIntegration } from './integrations/spanStreaming';
