import { getOriginalFunction, markFunctionWrapped } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';
import type { Env, Hono } from 'hono';
import { wrapMiddlewareWithSpan } from './patchAppUse';

/**
 * Hono stores every route as `{ method, path, handler }` in `app.routes`.
 * Internally, `app.use()` always registers with `method: 'ALL'` (via the
 * constant `METHOD_NAME_ALL`), while `app.get()` / `.post()` / etc. use
 * their respective uppercase method name.
 *
 * `app.all()` also produces `method: 'ALL'`, making it indistinguishable
 * from middleware in the route record.  Wrapping those handlers is harmless
 * because the resulting span uses `onlyIfParent: true` — it only materialises
 * when there is already an active transaction, and adds negligible overhead.
 */
const HONO_METHOD_ALL = 'ALL';

/**
 * Patches `HonoBase.prototype.route` so that when a sub-app is mounted via
 * `app.route('/prefix', subApp)`, its middleware handlers are retroactively
 * wrapped in Sentry spans *before* Hono copies them into the parent router.
 *
 * `route` lives on the prototype (unlike `use`, `get`, `all`, etc. which
 * are own properties assigned in the HonoBase constructor).
 */
interface HonoBaseProto {
  // oxlint-disable-next-line typescript/no-explicit-any
  route: (path: string, app: Hono<any>) => Hono<any>;
}

export function patchRoute<E extends Env>(app: Hono<E>): void {
  const honoBaseProto = Object.getPrototypeOf(Object.getPrototypeOf(app)) as HonoBaseProto | null;
  if (!honoBaseProto || typeof honoBaseProto.route !== 'function') {
    return;
  }

  if (getOriginalFunction(honoBaseProto.route as unknown as WrappedFunction)) {
    return;
  }

  const originalRoute = honoBaseProto.route;

  // oxlint-disable-next-line typescript/no-explicit-any
  const patchedRoute = function (this: Hono<any>, path: string, subApp: Hono<any>): Hono<any> {
    if (subApp && Array.isArray(subApp.routes)) {
      for (const r of subApp.routes) {
        if (r.method === HONO_METHOD_ALL && typeof r.handler === 'function') {
          r.handler = wrapMiddlewareWithSpan(r.handler);
        }
      }
    }
    return originalRoute.call(this, path, subApp);
  };

  markFunctionWrapped(patchedRoute as unknown as WrappedFunction, originalRoute as unknown as WrappedFunction);
  honoBaseProto.route = patchedRoute;
}
