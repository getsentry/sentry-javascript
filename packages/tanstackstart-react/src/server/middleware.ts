import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';

const SENTRY_WRAPPED = Symbol.for('sentry.middleware.wrapped');

type TanStackMiddleware = {
  options: { server: (...args: unknown[]) => unknown };
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
export function wrapMiddlewareWithSentry<T extends TanStackMiddleware>(
  middleware: T,
  options: MiddlewareWrapperOptions,
): T {
  if ((middleware as Record<symbol, unknown>)[SENTRY_WRAPPED]) {
    return middleware;
  }

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

  Object.defineProperty(middleware, SENTRY_WRAPPED, { value: true });
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
export function wrapMiddlewareListWithSentry<T extends TanStackMiddleware>(middlewares: Record<string, T>): T[] {
  return Object.entries(middlewares).map(([name, middleware]) => {
    return wrapMiddlewareWithSentry(middleware, { name });
  });
}
