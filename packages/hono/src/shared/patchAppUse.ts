import { debug } from '@sentry/core';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { DEBUG_BUILD } from '../debug-build';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';

// oxlint-disable-next-line typescript/no-explicit-any
const patchedInstances = new WeakSet<Hono<any>>();

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'options', 'patch', 'all'] as const;

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

/**
 * Patches HTTP method class fields (get, post, put, delete, options, patch, all) to instrument inline middleware at registration time.
 *
 * For `app.get('/path', mw1, mw2, handler)`, all handlers except the last are middleware and get wrapped with spans.
 * The final handler (the route handler) is already covered by the root http.server transaction.
 */
export function patchHttpMethodHandlers<E extends Env>(app: Hono<E>): void {
  for (const method of HTTP_METHODS) {
    app[method] = new Proxy(app[method], {
      apply(target, thisArg, args: unknown[]) {
        return Reflect.apply(target, thisArg, wrapInlineMiddleware(args));
      },
    });
  }

  app.on = new Proxy(app.on, {
    apply(target, thisArg, args: unknown[]) {
      // .on(method, path, ...handlers) — first two args are method and path
      const [method, path, ...handlers] = args;
      return Reflect.apply(target, thisArg, [method, path, ...wrapInlineMiddleware(handlers)]);
    },
  });
}

/**
 * Given `[path?, ...handlers]` or `[...handlers]`, wraps all handlers except the last one with spans.
 * The last handler is the route handler and is left as-is.
 */
function wrapInlineMiddleware(args: unknown[]): unknown[] {
  const hasPathPrefix = typeof args[0] === 'string';
  const handlersStart = hasPathPrefix ? 1 : 0;
  const handlers = args.slice(handlersStart) as MiddlewareHandler[];

  if (handlers.length <= 1) {
    return args;
  }

  const wrapped = [...args];
  for (let i = handlersStart; i < wrapped.length - 1; i++) {
    wrapped[i] = wrapMiddlewareWithSpan(wrapped[i] as MiddlewareHandler);
  }
  return wrapped;
}
