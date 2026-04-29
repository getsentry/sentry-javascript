import { getOriginalFunction, markFunctionWrapped } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import type { Env, Hono, MiddlewareHandler } from 'hono';
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
 * Patches `HonoBase.prototype.route` so that when a sub-app is mounted via `app.route('/prefix', subApp)`, its middleware handlers
 * are retroactively wrapped in Sentry spans before the parent copies them.
 *
 * `route` lives on the prototype (unlike `use` which is a class field)
 */
export function patchRoute<E extends Env>(app: Hono<E>): void {
  const honoBaseProto = Object.getPrototypeOf(Object.getPrototypeOf(app)) as HonoBaseProto;
  if (!honoBaseProto || typeof honoBaseProto?.route !== 'function') {
    return;
  }

  if (getOriginalFunction(honoBaseProto.route as WrappedFunction)) {
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
 * Figures out which handlers in a sub-app's flat routes array are middleware (and should get a span), then wraps them.
 *
 * The challenge: Hono stores every handler as a plain { method, path, handler } entry. There is no "isMiddleware" flag.
 * Two heuristics identify middleware:
 *
 * 1. Position within a group. `app.get('/path', mw, handler)` produces two entries with the same method+path.
 *    All but the last one must be middleware, because only middleware calls `next()` to pass control to the next handler.
 *
 * 2. Function arity (# of params) for method 'ALL'. Both `.use()` and `.all()` store their handlers under method 'ALL',
 *    so we can't use position alone to tell them apart when one is the last (or only) entry in its group.
 *    The deciding factor: Hono's `.use()` only accepts `(context, next)` (handlers with 2+ params). While `.all()` route
 *    handlers typically only accept `(context)`.
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
