import { debug, getOriginalFunction } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { Hono, HonoRoute } from './honoTypes';
import { getMiddlewareFlags } from './isMiddleware';
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
 * Wraps the middleware handlers of a sub-app's routes in spans.
 */
export function wrapSubAppMiddleware(routes: HonoRoute[]): void {
  const middlewareFlags = getMiddlewareFlags(routes);
  for (const [i, route] of routes.entries()) {
    if (middlewareFlags[i] && typeof route.handler === 'function') {
      route.handler = wrapMiddlewareWithSpan(route.handler);
    }
  }
}
