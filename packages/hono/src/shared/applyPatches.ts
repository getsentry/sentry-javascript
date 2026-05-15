import { debug } from '@sentry/core';
import type { Env, Hono } from 'hono';
import { DEBUG_BUILD } from '../debug-build';
import { patchAppRequest } from './patchAppRequest';
import { patchAppUse } from './patchAppUse';
import { type HonoRoute, type RouteHookHandle, installRouteHookOnPrototype, wrapSubAppMiddleware } from './patchRoute';

// Lazily set by the first call to earlyPatchHono or applyPatches.
let _routeHook: RouteHookHandle | undefined;

/**
 * Hooks `HonoBase.prototype.route` at import time, before `sentry()` runs.
 *
 * Collecting sub-app references early ensures nothing is missed if sub-apps are mounted synchronously before the `sentry()` middleware is registered.
 */
export function earlyPatchHono(): void {
  _routeHook ??= installRouteHookOnPrototype();
}

/**
 * Instruments a Hono app instance for Sentry tracing in middleware and route handlers.
 *
 * - `use` and `request` are per-instance class fields → must be patched on the instance.
 * - `route` is a prototype method → hooked once globally, covers all instances.
 * - Retroactively instruments sub-apps mounted before `sentry()` was called.
 */
export function applyPatches<E extends Env>(app: Hono<E>): void {
  // Always call — installRouteHookOnPrototype is idempotent and returns existing handle when prototype already patched
  _routeHook = installRouteHookOnPrototype();

  // `app.use` (instance own property) — wraps middleware at registration time on this instance.
  patchAppUse(app);

  patchAppRequest(app);

  _routeHook.activate();

  const pendingSubApps = _routeHook.getPendingSubApps();

  if (pendingSubApps.size > 0) {
    DEBUG_BUILD &&
      debug.log(`[hono] Retroactively instrumenting ${pendingSubApps.size} sub-app(s) mounted before sentry().`);
  }

  for (const subApp of pendingSubApps) {
    wrapSubAppMiddleware(subApp.routes as HonoRoute[]);
    patchAppRequest(subApp);
  }

  pendingSubApps.clear();
}
