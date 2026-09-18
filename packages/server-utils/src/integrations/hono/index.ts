import { applyPatches } from './applyPatches';
import type { Hono } from './honoTypes';

// The auto-instrumentation integration (uses `node:diagnostics_channel`).
export { honoIntegration } from './honoIntegration';
export type { HonoIntegrationOptions } from './honoIntegration';

// Manual counterpart of the auto-instrumentation, for setups where neither the Sentry runtime hook
// nor the bundler plugin is active (so the per-request Context hook never fires):
// `app.use(honoMiddleware(app))`.
export { honoMiddleware } from './honoIntegration';

// Shared, runtime-agnostic Hono instrumentation, re-used by the `@sentry/hono` SDK across all of its
// runtimes (Node, Bun, Cloudflare, Deno). None of these modules import `hono` (at runtime or type
// level), so they stay safe to load in every server SDK — including apps that do not use Hono.
export { earlyPatchHono } from './applyPatches';
export { createHonoRequestMiddleware } from './createHonoMiddleware';
export type { CreateHonoRequestMiddlewareOptions } from './createHonoMiddleware';
export type { SentryHonoMiddlewareOptions } from './types';

/**
 * Applies Sentry's Hono span patches to an app instance.
 *
 * Typed loosely (`object`) so the real `hono` `Hono<E, S, P>` type used by the `@sentry/hono` SDK is
 * accepted without a cast; internally it is treated as the vendored {@link Hono} shape.
 */
export function applyHonoPatches(app: object): void {
  applyPatches(app as Hono);
}
