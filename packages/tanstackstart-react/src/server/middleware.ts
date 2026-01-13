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
function getNextProxy<T extends (...args: unknown[]) => unknown>(
  next: T,
  span: Span,
  prevSpan: Span | undefined,
  nextState: { called: boolean },
): T {
  return new Proxy(next, {
    apply: (originalNext, thisArgNext, argsNext) => {
      nextState.called = true;
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
 */
function wrapMiddlewareWithSentry<T extends TanStackMiddlewareBase>(
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

        return startSpanManual(getMiddlewareSpanOptions(options.name), async (span: Span) => {
          const nextState = { called: false };

          // The server function receives { next, context, request } as first argument
          // Users call next() inside their middleware to move down the middleware chain. We proxy next() to end the span when it is called.
          const middlewareArgs = argsServer[0] as { next?: (...args: unknown[]) => unknown } | undefined;
          if (middlewareArgs && typeof middlewareArgs === 'object' && typeof middlewareArgs.next === 'function') {
            middlewareArgs.next = getNextProxy(middlewareArgs.next, span, prevSpan, nextState);
          }

          try {
            const result = await originalServer.apply(thisArgServer, argsServer);

            // End span here if next() wasn't called, else we already ended it in next()
            if (!nextState.called) {
              span.end();
            }

            return result;
          } catch (e) {
            span.end();
            throw e;
          }
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
 * import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';
 *
 * const wrappedMiddlewares = wrapMiddlewaresWithSentry({
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
export function wrapMiddlewaresWithSentry<T extends TanStackMiddlewareBase>(middlewares: Record<string, T>): T[] {
  return Object.entries(middlewares).map(([name, middleware]) => {
    return wrapMiddlewareWithSentry(middleware, { name });
  });
}
