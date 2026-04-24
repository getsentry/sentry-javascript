import { getOriginalFunction, markFunctionWrapped } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import type { Env, Hono } from 'hono';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';

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
      for (const route of subApp.routes) {
        /* Internally, `app.use()` always registers with `method: 'ALL'` (via the constant `METHOD_NAME_ALL`),
         * while `app.get()` / `.post()` / etc. use their respective uppercase method name.
         * https://github.com/honojs/hono/blob/18fe604c8cefc2628240651b1af219692e1918c1/src/hono-base.ts#L156-L168
         */
        if (route.method === 'ALL' && typeof route.handler === 'function') {
          route.handler = wrapMiddlewareWithSpan(route.handler);
        }
      }
    }
    return originalRoute.call(this, path, subApp);
  };

  markFunctionWrapped(patchedRoute as unknown as WrappedFunction, originalRoute as unknown as WrappedFunction);
  honoBaseProto.route = patchedRoute;
}
