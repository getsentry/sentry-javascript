import { Scope, getActiveSpan, getCapturedScopesOnSpan, getRootSpan, setCapturedScopesOnSpan } from '@sentry/core';

import type { RouteHandlerContext } from './types';

import { commonObjectToIsolationScope } from './utils/tracingUtils';

/**
 * Wraps a Next.js App Router Route handler with Sentry error and performance instrumentation.
 *
 * NOTICE: This wrapper is for App Router API routes. If you are looking to wrap Pages Router API routes use `wrapApiHandlerWithSentry` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  const { headers } = context;

  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      const isolationScope = commonObjectToIsolationScope(headers);

      const activeSpan = getActiveSpan();
      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        const { scope } = getCapturedScopesOnSpan(rootSpan);
        setCapturedScopesOnSpan(rootSpan, scope ?? new Scope(), isolationScope);

        // We mark the root span as an app route handler span so we can allow-list it in our span processor
        // that would normally filter out all Next.js transactions/spans
        rootSpan.setAttribute('sentry.route_handler', true);
      }

      return originalFunction.apply(thisArg, args);
    },
  });
}
