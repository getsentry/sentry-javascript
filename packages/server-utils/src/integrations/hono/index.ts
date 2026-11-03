// The auto-instrumentation integration (uses `node:diagnostics_channel`).
export { honoIntegration } from './honoIntegration';
export type { HonoIntegrationOptions } from './honoIntegration';

// Manual counterpart of the auto-instrumentation, for setups where neither the Sentry runtime hook
// nor the bundler plugin is active (so the per-request Context hook never fires):
// `app.use(honoMiddleware(app))`.
export { honoMiddleware } from './honoIntegration';

// Shared, runtime-agnostic Hono instrumentation, re-used by the `@sentry/hono` SDK across all of its
// runtimes (Node, Bun, Cloudflare, Deno). None of these modules import `hono` or `node:diagnostics_channel`,
// so they stay safe to load in every server SDK — including the Node-free (`no-diagnostic-channels`) entry.
export { applyHonoPatches, earlyPatchHono } from './applyPatches';
export { createHonoRequestMiddleware } from './createHonoMiddleware';
export type { CreateHonoRequestMiddlewareOptions } from './createHonoMiddleware';
export type { SentryHonoMiddlewareOptions } from './types';
