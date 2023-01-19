import { getCurrentHub } from '@sentry/core';

import type { EdgeRouteHandler } from './types';
import { withEdgeWrapping } from './utils/edgeWrapperUtils';

/**
 * Wraps a Next.js edge route handler with Sentry error and performance instrumentation.
 */
export function wrapApiHandlerWithSentry<H extends EdgeRouteHandler>(
  handler: H,
  parameterizedRoute: string,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return async function (this: unknown, ...args: Parameters<H>): Promise<ReturnType<H>> {
    const req = args[0];

    const activeSpan = !!getCurrentHub().getScope()?.getSpan();

    const wrappedHandler = withEdgeWrapping(handler, {
      spanDescription:
        activeSpan || !(req instanceof Request)
          ? `handler (${parameterizedRoute})`
          : `${req.method} ${parameterizedRoute}`,
      spanOp: activeSpan ? 'function' : 'http.server',
      mechanismFunctionName: 'wrapApiHandlerWithSentry',
    });

    return await wrappedHandler.apply(this, args);
  };
}

/**
 * @deprecated Use `wrapApiHandlerWithSentry` instead.
 */
export const withSentryAPI = wrapApiHandlerWithSentry;
