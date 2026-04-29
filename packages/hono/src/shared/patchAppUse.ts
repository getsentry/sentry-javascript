import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';
import type { Env, Hono, MiddlewareHandler } from 'hono';

/**
 * Patches the Hono app so that middleware is automatically traced as Sentry spans.
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
