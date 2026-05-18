import { debug } from '@sentry/core';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { DEBUG_BUILD } from '../debug-build';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';

// oxlint-disable-next-line typescript/no-explicit-any
const patchedInstances = new WeakSet<Hono<any>>();

/**
 * Patches `app.use` (instance own property) on a Hono instance to instrument middleware at registration time.
 *
 * Must be per-instance because `use` is a class field, not a prototype method.
 * Idempotent.
 */
export function patchAppUse<E extends Env>(app: Hono<E>): void {
  if (patchedInstances.has(app)) {
    DEBUG_BUILD && debug.log('[hono] app.use already patched — skipping.');
    return;
  }

  patchedInstances.add(app);

  app.use = new Proxy(app.use, {
    apply(target: typeof app.use, thisArg: typeof app, args: Parameters<typeof app.use>): ReturnType<typeof app.use> {
      const [first, ...rest] = args as [unknown, ...MiddlewareHandler[]];

      if (typeof first === 'string') {
        const wrappedHandlers = rest.map(handler => wrapMiddlewareWithSpan(handler));
        return Reflect.apply(target, thisArg, [first, ...wrappedHandlers]);
      }

      const allHandlers = [first as MiddlewareHandler, ...rest].map(handler => wrapMiddlewareWithSpan(handler));
      return Reflect.apply(target, thisArg, allHandlers);
    },
  });
}
