import { captureException, getIsolationScope, winterCGRequestToRequestData } from '@sentry/core';
import { flushSafelyWithTimeout } from '../common/utils/responseEnd';
import type { EdgeRouteHandler } from './types';

/**
 * Wraps a Next.js edge route handler with Sentry error monitoring.
 */
export function wrapApiHandlerWithSentry<H extends EdgeRouteHandler>(
  handler: H,
  parameterizedRoute: string,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(handler, {
    apply: async (wrappingTarget, thisArg, args: Parameters<H>) => {
      try {
        const req: unknown = args[0];

        // Set transaction name on isolation scope to ensure parameterized routes are used
        // The HTTP server integration sets it on isolation scope, so we need to match that
        const isolationScope = getIsolationScope();

        if (req instanceof Request) {
          const method = req.method || 'GET';
          isolationScope.setTransactionName(`${method} ${parameterizedRoute}`);
          // Set SDK processing metadata
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: winterCGRequestToRequestData(req),
          });
        } else {
          isolationScope.setTransactionName(`handler (${parameterizedRoute})`);
        }

        return await wrappingTarget.apply(thisArg, args);
      } catch (error) {
        captureException(error, {
          mechanism: {
            type: 'auto.function.nextjs.wrap_api_handler',
            handled: false,
          },
        });

        // we need to await the flush here to ensure that the error is captured
        // as the runtime freezes as soon as the error is thrown below
        await flushSafelyWithTimeout();

        // We rethrow here so that nextjs can do with the error whatever it would normally do.
        throw error;
      }
    },
  });
}
