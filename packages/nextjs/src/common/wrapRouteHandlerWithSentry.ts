import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addTracingExtensions,
  captureException,
  continueTrace,
  handleCallbackErrors,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { winterCGHeadersToDict } from '@sentry/utils';

import { isRedirectNavigationError } from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  addTracingExtensions();
  const { method, parameterizedRoute, headers } = context;
  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return withIsolationScope(async isolationScope => {
        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headers ? winterCGHeadersToDict(headers) : undefined,
          },
        });
        return continueTrace(
          {
            sentryTrace: headers?.get('sentry-trace') ?? undefined,
            baggage: headers?.get('baggage'),
          },
          async () => {
            try {
              return await startSpan(
                {
                  op: 'http.server',
                  name: `${method} ${parameterizedRoute}`,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
                  },
                },
                async span => {
                  const response: Response = await handleCallbackErrors(
                    () => originalFunction.apply(thisArg, args),
                    error => {
                      // Next.js throws errors when calling `redirect()`. We don't wanna report these.
                      if (!isRedirectNavigationError(error)) {
                        captureException(error, {
                          mechanism: {
                            handled: false,
                          },
                        });
                      }
                    },
                  );

                  try {
                    span && setHttpStatus(span, response.status);
                  } catch {
                    // best effort - response may be undefined?
                  }

                  return response;
                },
              );
            } finally {
              if (!platformSupportsStreaming() || process.env.NEXT_RUNTIME === 'edge') {
                // 1. Edge transport requires manual flushing
                // 2. Lambdas require manual flushing to prevent execution freeze before the event is sent
                await flushQueue();
              }
            }
          },
        );
      });
    },
  });
}
