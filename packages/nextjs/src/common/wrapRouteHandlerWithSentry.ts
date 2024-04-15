import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  captureException,
  getActiveSpan,
  getRootSpan,
  handleCallbackErrors,
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
  const { method, parameterizedRoute, headers } = context;

  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return withIsolationScopeOrReuseFromRootSpan(async isolationScope => {
        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headers ? winterCGHeadersToDict(headers) : undefined,
          },
        });

        const activeSpan = getActiveSpan();
        const rootSpan = activeSpan && getRootSpan(activeSpan);

        if (rootSpan) {
          rootSpan.updateName(`${method} ${parameterizedRoute}`);
          rootSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
          });
        }

        try {
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
