import type { Env, Hono } from 'hono';
import { patchAppUse } from './patchAppUse';
import { installRouteHookOnPrototype } from './patchRoute';

/**
 * Instruments a Hono app instance for Sentry tracing in middleware and route handlers.
 *
 * Two strategies are needed because Hono mixes instance fields and prototype methods:
 * - `use` is a per-instance class field (instance own property) → must be patched on the instance
 * - `route` is a prototype method → patched once globally, covers all instances
 */
export function applyPatches<E extends Env>(app: Hono<E>): void {
  // `app.use` (instance own property) — wraps middleware at registration time on this instance.
  patchAppUse(app);

  // `route()` lives on the shared prototype and is patched once globally.
  installRouteHookOnPrototype();
}
