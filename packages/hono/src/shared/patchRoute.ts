import { getOriginalFunction, markFunctionWrapped } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import type { Hono, MiddlewareHandler } from 'hono';
import { Hono as HonoClass } from 'hono';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';

interface HonoRoute {
  method: string;
  path: string;
  handler: MiddlewareHandler;
}

interface HonoBaseProto {
  // oxlint-disable-next-line typescript/no-explicit-any
  route: (path: string, app: Hono<any>) => Hono<any>;
}

/**
 * Patches `route()` on the Hono base prototype once, globally.
 *
 * Wraps sub-app middleware at mount time so that `app.route('/prefix', subApp)` is traced.
 * Idempotent: safe to call multiple times.
 */
export function installRouteHookOnPrototype(): void {
  // `route` is on the base prototype, not the concrete subclass, walk up one level
  const honoBaseProto = Object.getPrototypeOf(HonoClass.prototype) as HonoBaseProto;
  if (!honoBaseProto || typeof honoBaseProto?.route !== 'function') {
    return;
  }

  // Already patched: return
  if (getOriginalFunction(honoBaseProto.route as unknown as WrappedFunction)) {
    return;
  }

  const originalRoute = honoBaseProto.route;

  // oxlint-disable-next-line typescript/no-explicit-any
  const patchedRoute = function (this: Hono<any>, path: string, subApp: Hono<any>): Hono<any> {
    if (subApp && Array.isArray(subApp.routes)) {
      wrapSubAppMiddleware(subApp.routes as HonoRoute[]);
    }
    return originalRoute.call(this, path, subApp);
  };

  markFunctionWrapped(patchedRoute as unknown as WrappedFunction, originalRoute as unknown as WrappedFunction);
  honoBaseProto.route = patchedRoute;
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
