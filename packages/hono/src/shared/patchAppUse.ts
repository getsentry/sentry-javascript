import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';
import type { Env, Hono, MiddlewareHandler } from 'hono';

/**
 * Patches `app.use` (instance own property) on a Hono instance to instrument middleware at registration time.
 *
 * Must be per-instance because `use` is a class field, not a prototype method.
 */
export function patchAppUse<E extends Env>(app: Hono<E>): void {
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
