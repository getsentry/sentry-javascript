import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { Env, Hono } from './honoTypes';
import { patchAppRequest } from './patchAppRequest';
import { patchAppUse, patchHttpMethodHandlers } from './patchAppUse';
import { type RouteHookHandle, installRouteHookOnPrototype, wrapSubAppMiddleware } from './patchRoute';

// Lazily set by the first call to earlyPatchHono or applyPatches.
let _routeHook: RouteHookHandle | undefined;

/**
 * Hooks `HonoBase.prototype.route` at import time, before `sentry()` runs.
 *
 * Collecting sub-app references early ensures nothing is missed if sub-apps are mounted synchronously
 * before the `sentry()` middleware is registered. The `Hono` class is passed in by the caller (the
 * `@sentry/hono` SDK, where `hono` is a peer dependency) so this module never imports `hono` itself;
 * `HonoBase.prototype` is one level above the class prototype.
 */
export function earlyPatchHono(honoClass: { prototype: object }): void {
  _routeHook ??= installRouteHookOnPrototype(Object.getPrototypeOf(honoClass.prototype));
}

/**
 * Instruments a Hono app instance for Sentry tracing in middleware and route handlers.
 *
 * - `use` and `request` are per-instance class fields → must be patched on the instance.
 * - `route` is a prototype method → hooked once globally, covers all instances.
 * - Retroactively instruments sub-apps mounted before `sentry()` was called.
 */
export function applyPatches<E extends Env>(app: Hono<E>): void {
  // `HonoBase.prototype` (where `route` lives) is two levels up from the app instance:
  // app → Hono.prototype → HonoBase.prototype. Deriving it from the live app avoids importing `hono`.
  // Always call — installRouteHookOnPrototype is idempotent and returns existing handle when prototype already patched
  _routeHook = installRouteHookOnPrototype(Object.getPrototypeOf(Object.getPrototypeOf(app)));

  // `app.use` (instance own property) — wraps middleware at registration time on this instance.
  patchAppUse(app);

  // `app.get`, `app.post`, … (instance own properties) — wraps inline middleware (all-but-last handler).
  patchHttpMethodHandlers(app);

  patchAppRequest(app);

  _routeHook.activate();

  const pendingSubApps = _routeHook.getPendingSubApps();

  if (pendingSubApps.size > 0) {
    DEBUG_BUILD &&
      debug.log(
        `[hono] ${pendingSubApps.size} sub-app(s) were mounted before sentry(). Tracing is applied retroactively. Consider registering sentry() before calling app.route().`,
      );
  }

  for (const subApp of pendingSubApps) {
    wrapSubAppMiddleware(subApp.routes);
    patchAppRequest(subApp);
  }

  pendingSubApps.clear();
}

/**
 * Applies Sentry's Hono span patches to an app instance.
 *
 * Typed loosely (`object`) so the real `hono` `Hono<E, S, P>` type used by the `@sentry/hono` SDK is
 * accepted without a cast; internally it is treated as the vendored {@link Hono} shape.
 */
export function applyHonoPatches(app: object): void {
  applyPatches(app as Hono);
}
