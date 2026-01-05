import { addNonEnumerableProperty } from '@sentry/core';
import type { Span } from '@sentry/node';
import { getActiveSpan, startSpanManual, withActiveSpan } from '@sentry/node';
import type { MiddlewareWrapperOptions, TanStackMiddlewareBase } from '../common/types';
import { getMiddlewareSpanOptions } from './utils';

const SENTRY_WRAPPED = '__SENTRY_WRAPPED__';

/**
 * Creates a proxy for the next function that ends the current span and restores the parent span.
 * This ensures that subsequent middleware spans are children of the root span, not nested children.
 */
function getNextProxy<T extends (...args: unknown[]) => unknown>(next: T, span: Span, prevSpan: Span | undefined): T {
  return new Proxy(next, {
    apply: (originalNext, thisArgNext, argsNext) => {
      span.end();

      if (prevSpan) {
        return withActiveSpan(prevSpan, () => {
          return Reflect.apply(originalNext, thisArgNext, argsNext);
        });
      }

      return Reflect.apply(originalNext, thisArgNext, argsNext);
    },
  });
}

/**
 * Wraps a TanStack Start middleware with Sentry instrumentation to create spans.
 *
 * @example
 * ```ts
 * import { wrapMiddlewareWithSentry } from '@sentry/tanstackstart-react';
 * import { createMiddleware } from '@tanstack/react-start';
 *
 * const authMiddleware = wrapMiddlewareWithSentry(
 *   createMiddleware().server(async ({ next }) => {
 *     // auth logic
 *     return next();
 *   }),
 *   { name: 'authMiddleware' }
 * );
 * ```
 *
 * @param middleware - The TanStack Start middleware to patch
 * @param options - Options for the wrapper (currently only the name of the middleware)
 * @returns The patched middleware
 */
export function wrapMiddlewareWithSentry<T extends TanStackMiddlewareBase>(
  middleware: T,
  options: MiddlewareWrapperOptions,
): T {
  if ((middleware as TanStackMiddlewareBase & { [SENTRY_WRAPPED]?: boolean })[SENTRY_WRAPPED]) {
    // already instrumented
    return middleware;
  }

  // instrument server middleware
  if (middleware.options?.server) {
    middleware.options.server = new Proxy(middleware.options.server, {
      apply: (originalServer, thisArgServer, argsServer) => {
        const prevSpan = getActiveSpan();

        return startSpanManual(getMiddlewareSpanOptions(options.name), (span: Span) => {
          // The server function receives { next, context, request } as first argument
          // We need to proxy the `next` function inside that object
          const middlewareArgs = argsServer[0] as { next?: (...args: unknown[]) => unknown } | undefined;
          if (middlewareArgs && typeof middlewareArgs === 'object' && typeof middlewareArgs.next === 'function') {
            middlewareArgs.next = getNextProxy(middlewareArgs.next, span, prevSpan);
          }

          return originalServer.apply(thisArgServer, argsServer);
        });
      },
    });

    // mark as instrumented
    addNonEnumerableProperty(middleware as unknown as Record<string, unknown>, SENTRY_WRAPPED, true);
  }

  return middleware;
}

/**
 * Wraps multiple TanStack Start middlewares with Sentry instrumentation.
 * Object keys are used as span names to avoid users having to specify this manually.
 *
 * @example
 * ```ts
 * import { wrapMiddlewareListWithSentry } from '@sentry/tanstackstart-react';
 *
 * const wrappedMiddlewares = wrapMiddlewareListWithSentry({
 *   authMiddleware,
 *   loggingMiddleware,
 * });
 *
 * createServerFn().middleware(wrappedMiddlewares)
 * ```
 *
 * @param middlewares - An object containing middlewares
 * @returns An array of wrapped middlewares
 */
export function wrapMiddlewareListWithSentry<T extends TanStackMiddlewareBase>(middlewares: Record<string, T>): T[] {
  return Object.entries(middlewares).map(([name, middleware]) => {
    return wrapMiddlewareWithSentry(middleware, { name });
  });
}
