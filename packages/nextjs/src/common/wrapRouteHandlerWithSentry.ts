import {
  SPAN_STATUS_ERROR,
  addTracingExtensions,
  captureException,
  getActiveSpan,
  getRootSpan,
  handleCallbackErrors,
  setHttpStatus,
  withIsolationScope,
} from '@sentry/core';
import { winterCGHeadersToDict } from '@sentry/utils';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';
import { withIsolationScopeOrReuseFromRootSpan } from './utils/withIsolationScopeOrReuseFromRootSpan';

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  addTracingExtensions();

  const { headers } = context;

  return new Proxy(routeHandler, {
    apply: async (originalFunction, thisArg, args) => {
      return withIsolationScope(async isolationScope => {
        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headers ? winterCGHeadersToDict(headers) : undefined,
          },
        });

        try {
          const activeSpan = getActiveSpan();
          const rootSpan = activeSpan && getRootSpan(activeSpan);

          const response: Response = await handleCallbackErrors(
            () => originalFunction.apply(thisArg, args),
            error => {
              // Next.js throws errors when calling `redirect()`. We don't wanna report these.
              if (isRedirectNavigationError(error)) {
                // Don't do anything
              } else if (isNotFoundNavigationError(error) && rootSpan) {
                rootSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
              } else {
                captureException(error, {
                  mechanism: {
                    handled: false,
                  },
                });
              }
            },
          );

          try {
            if (rootSpan && response.status) {
              setHttpStatus(rootSpan, response.status);
            }
          } catch {
            // best effort - response may be undefined?
          }

          return response;
        } finally {
          if (!platformSupportsStreaming() || process.env.NEXT_RUNTIME === 'edge') {
            // 1. Edge transport requires manual flushing
            // 2. Lambdas require manual flushing to prevent execution freeze before the event is sent
            await flushQueue();
          }
        }
      });
    },
  });
}
