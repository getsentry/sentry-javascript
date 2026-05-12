import { debug, getOriginalFunction, markFunctionWrapped } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import type { Hono, MiddlewareHandler } from 'hono';
import { Hono as HonoClass } from 'hono';
import { DEBUG_BUILD } from '../debug-build';
import { patchAppRequest } from './patchAppRequest';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';

export type HonoRoute = {
  method: string;
  path: string;
  handler: MiddlewareHandler;
};

// oxlint-disable-next-line typescript/no-explicit-any
type HonoAny = Hono<any>;

export type RouteHookHandle = {
  activate: () => void;
  getPendingSubApps: () => Set<HonoAny>;
};

type HonoBaseProto = {
  route?: (path: string, app: HonoAny) => HonoAny;
  __sentryRouteHook__?: RouteHookHandle;
};

/**
 * Creates the two-phase state machine for the route hook.
 *
 * - Pre-activation: collects sub-app references into a pending set.
 * - Post-activation: instruments sub-apps immediately at mount time.
 */
function createRouteHook(): { handle: RouteHookHandle; onSubAppMounted: (subApp: HonoAny) => void } {
  const pendingSubApps = new Set<HonoAny>();
  let activated = false;

  return {
    handle: {
      activate: () => {
        activated = true;
      },
      getPendingSubApps: () => pendingSubApps,
    },
    onSubAppMounted: (subApp: HonoAny) => {
      if (activated) {
        DEBUG_BUILD && debug.log(`[hono] Instrumenting sub-app at mount time (${subApp.routes.length} routes).`);
        wrapSubAppMiddleware(subApp.routes as HonoRoute[]);
        patchAppRequest(subApp);
      } else {
        DEBUG_BUILD &&
          debug.log(`[hono] Collecting sub-app for deferred instrumentation (${subApp.routes.length} routes).`);
        pendingSubApps.add(subApp);
      }
    },
  };
}

/**
 * Installs a hook on `HonoBase.prototype.route` to intercept sub-app mounting.
 *
 * Returns a handle with `activate()` and `getPendingSubApps()`.
 * Idempotent: subsequent calls return the same handle
 */
export function installRouteHookOnPrototype(): RouteHookHandle {
  const noopHandle: RouteHookHandle = { activate: () => {}, getPendingSubApps: () => new Set() };

  // `route` is defined on HonoBase.prototype, one level above the concrete subclass
  const honoBaseProto = Object.getPrototypeOf(HonoClass.prototype) as HonoBaseProto;

  if (!honoBaseProto || typeof honoBaseProto.route !== 'function') {
    DEBUG_BUILD && debug.warn('[hono] Could not find HonoBase.prototype.route — sub-app instrumentation disabled.');
    return noopHandle;
  }

  // Already patched
  if (getOriginalFunction(honoBaseProto.route as unknown as WrappedFunction)) {
    return honoBaseProto.__sentryRouteHook__ ?? noopHandle;
  }

  const originalRoute = honoBaseProto.route;
  const { handle, onSubAppMounted } = createRouteHook();

  const patchedRoute = function (this: HonoAny, path: string, subApp: HonoAny): HonoAny {
    if (subApp && Array.isArray(subApp.routes)) {
      onSubAppMounted(subApp);
    }

    return originalRoute.call(this, path, subApp);
  };

  markFunctionWrapped(patchedRoute as unknown as WrappedFunction, originalRoute as unknown as WrappedFunction);
  honoBaseProto.route = patchedRoute;
  honoBaseProto.__sentryRouteHook__ = handle;

  DEBUG_BUILD && debug.log('[hono] Installed route hook on HonoBase.prototype.');

  return handle;
}

/**
 * Identifies middleware handlers in a sub-app's flat routes array and wraps them in spans.
 *
 * Heuristics (since Hono has no "isMiddleware" flag):
 * 1. Position: `app.get('/path', mw, handler)` produces entries with the same method+path.
 *    All but the LAST are middleware (they call `next()`).
 * 2. Arity (# of params) for method 'ALL': `.use()` handlers always have 2+ params (context, next),
 *    while `.all()` route handlers typically have 1 (`context` only).
 *    See: https://github.com/honojs/hono/blob/18fe604c8cefc2628240651b1af219692e1918c1/src/hono-base.ts#L156-L168
 */
export function wrapSubAppMiddleware(routes: HonoRoute[]): void {
  const lastIndexByKey = new Map<string, number>();
  for (const [i, route] of routes.entries()) {
    // \0 (null byte) is a collision-free delimiter: it cannot appear in a valid HTTP method name or URL path
    lastIndexByKey.set(`${route.method}\0${route.path}`, i);
  }

  for (const [i, route] of routes.entries()) {
    if (typeof route.handler !== 'function') {
      continue;
    }

    const isLastForGroup = lastIndexByKey.get(`${route.method}\0${route.path}`) === i;

    const isMiddleware = !isLastForGroup || (route.method === 'ALL' && route.handler.length >= 2);
    if (isMiddleware) {
      route.handler = wrapMiddlewareWithSpan(route.handler);
    }
  }
}
