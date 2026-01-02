import { addNonEnumerableProperty } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';

type TanStackMiddleware = {
  options?: { server?: (...args: unknown[]) => unknown };
  SENTRY_WRAPPED?: boolean;
};

type MiddlewareWrapperOptions = {
  name: string;
};

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
 * @param middleware - The TanStack Start middleware to wrap
 * @param options - Options for the wrapper, including the span name
 * @returns The wrapped middleware with Sentry instrumentation
 */
export function wrapMiddlewareWithSentry(
  middleware: TanStackMiddleware,
  options: MiddlewareWrapperOptions,
): TanStackMiddleware {
  if (middleware.SENTRY_WRAPPED) {
    return middleware;
  }

  if (middleware.options?.server) {
    middleware.options.server = new Proxy(middleware.options.server, {
      apply: (target, thisArg, args) => {
        return startSpan(
          {
            op: 'middleware.tanstackstart',
            name: options.name,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual.middleware.tanstackstart',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.tanstackstart',
            },
          },
          () => target.apply(thisArg, args),
        );
      },
    });
  }

  addNonEnumerableProperty(middleware, 'SENTRY_WRAPPED', true);
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
export function wrapMiddlewareListWithSentry(middlewares: Record<string, TanStackMiddleware>): TanStackMiddleware[] {
  return Object.entries(middlewares).map(([name, middleware]) => {
    return wrapMiddlewareWithSentry(middleware, { name });
  });
}
