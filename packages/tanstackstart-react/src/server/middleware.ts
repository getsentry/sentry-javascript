import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';

const SENTRY_WRAPPED = Symbol.for('sentry.middleware.wrapped');

type TanStackMiddleware = {
  options: { type: string; server: (...args: unknown[]) => unknown };
  middleware: (...args: unknown[]) => unknown;
  inputValidator: (...args: unknown[]) => unknown;
  client: (...args: unknown[]) => unknown;
  server: (...args: unknown[]) => unknown;
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
  // Check for double-wrapping
  if ((middleware as unknown as Record<symbol, unknown>)[SENTRY_WRAPPED]) {
    return middleware;
  }

  const originalServerFn = middleware.options.server;

  // Wrap the options.server function (this is what TanStack Start actually calls)
  const wrappedServerFn = function (this: unknown, ...args: unknown[]): unknown {
    return startSpan(
      {
        op: 'middleware.tanstackstart',
        name: options.name,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual.middleware.tanstackstart',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.tanstackstart',
        },
      },
      () => originalServerFn.apply(this, args),
    );
  };

  // Create a new middleware object with the wrapped server function
  const wrappedMiddleware = {
    ...middleware,
    options: {
      ...middleware.options,
      server: wrappedServerFn,
    },
  };

  // Mark the whole object as wrapped
  Object.defineProperty(wrappedMiddleware, SENTRY_WRAPPED, { value: true });

  return wrappedMiddleware as T;
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
