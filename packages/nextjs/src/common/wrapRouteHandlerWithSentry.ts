import { addTracingExtensions, captureException, flush, getCurrentHub, runWithAsyncContext, trace } from '@sentry/core';
import { tracingContextFromHeaders } from '@sentry/utils';

import type { RouteHandlerContext } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  addTracingExtensions();

  const { method, parameterizedRoute, baggageHeader, sentryTraceHeader } = context;

  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return runWithAsyncContext(async () => {
        const hub = getCurrentHub();
        const currentScope = hub.getScope();

        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          sentryTraceHeader,
          baggageHeader,
        );
        currentScope.setPropagationContext(propagationContext);

        const res = await trace(
          {
            op: 'http.server',
            name: `${method} ${parameterizedRoute}`,
            status: 'ok',
            ...traceparentData,
            metadata: {
              source: 'route',
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            },
          },
          async span => {
            const response: Response = await originalFunction.apply(thisArg, args);

            try {
              span?.setHttpStatus(response.status);
            } catch {
              // best effort
            }

            return response;
          },
          error => {
            captureException(error);
          },
        );

        if (!platformSupportsStreaming()) {
          await flush(1000);
        }

        return res;
      });
    },
  });
}
