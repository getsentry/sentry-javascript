import { debug, getOriginalFunction } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { Hono, HonoRoute } from './honoTypes';
import { isMiddleware } from './isMiddleware';
import { patchAppRequest } from './patchAppRequest';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';

export type { HonoRoute };

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
        wrapSubAppMiddleware(subApp.routes);
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
 * `honoBaseProto` is `HonoBase.prototype`, where `route` is defined — one level above the concrete
 * subclass. Callers derive it from a live app instance (`Object.getPrototypeOf(Object.getPrototypeOf(app))`)
 * or from the `Hono` class (`Object.getPrototypeOf(Hono.prototype)`), so the instrumentation never
 * imports `hono` itself.
 *
 * Returns a handle with `activate()` and `getPendingSubApps()`.
 * Idempotent: subsequent calls return the same handle
 */
export function installRouteHookOnPrototype(honoBaseProto: HonoBaseProto): RouteHookHandle {
  const noopHandle: RouteHookHandle = { activate: () => {}, getPendingSubApps: () => new Set() };

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

  honoBaseProto.route = new Proxy(originalRoute, {
    apply(_target, thisArg, args: [string, HonoAny]) {
      const [, subApp] = args;
      if (subApp && Array.isArray(subApp.routes)) {
        onSubAppMounted(subApp);
      }

      return Reflect.apply(_target, thisArg, args);
    },
    get(target, prop, receiver) {
      if (prop === '__sentry_original__') {
        return originalRoute;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
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

    const isMW = !isLastForGroup || (route.method === 'ALL' && isMiddleware(route.handler));
    if (isMW) {
      route.handler = wrapMiddlewareWithSpan(route.handler);
    }
  }
}
