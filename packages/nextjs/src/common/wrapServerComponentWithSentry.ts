import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  captureException,
  getActiveSpan,
  handleCallbackErrors,
  startSpanManual,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { propagationContextFromHeaders, uuid4, winterCGHeadersToDict } from '@sentry/utils';

import { context as otelContext } from '@opentelemetry/api';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { EXPERIMENTAL_SENTRY_REQUEST_SPAN_ID_SUGGESTION_CONTEXT_KEY } from '@sentry/opentelemetry';
import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';
import { flushQueue } from './utils/responseEnd';
import {
  commonObjectToIsolationScope,
  commonObjectToPropagationContext,
  escapeNextjsTracing,
} from './utils/tracingUtils';

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerComponentWithSentry<F extends (...args: any[]) => any>(
  appDirComponent: F,
  context: ServerComponentContext,
): F {
  const { componentRoute, componentType } = context;
  // Even though users may define server components as async functions, for the client bundles
  // Next.js will turn them into synchronous functions and it will transform any `await`s into instances of the `use`
  // hook. 🤯
  return new Proxy(appDirComponent, {
    apply: (originalFunction, thisArg, args) => {
      const requestTraceId = getActiveSpan()?.spanContext().traceId;
      return escapeNextjsTracing(() => {
        const isolationScope = commonObjectToIsolationScope(context.headers);

        const headersDict = context.headers ? winterCGHeadersToDict(context.headers) : undefined;

        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headersDict,
          },
        });

        return withIsolationScope(isolationScope, () => {
          return withScope(scope => {
            scope.setTransactionName(`${componentType} Server Component (${componentRoute})`);

            const propagationContext = commonObjectToPropagationContext(
              context.headers,
              headersDict?.['sentry-trace']
                ? propagationContextFromHeaders(headersDict['sentry-trace'], headersDict['baggage'])
                : {
                    traceId: requestTraceId || uuid4(),
                    spanId: uuid4().substring(16),
                    parentSpanId: otelContext
                      .active()
                      .getValue(EXPERIMENTAL_SENTRY_REQUEST_SPAN_ID_SUGGESTION_CONTEXT_KEY) as string | undefined,
                  },
            );

            scope.setPropagationContext(propagationContext);
            return startSpanManual(
              {
                op: 'function.nextjs',
                name: `${componentType} Server Component (${componentRoute})`,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
                },
              },
              span => {
                return handleCallbackErrors(
                  () => originalFunction.apply(thisArg, args),
                  error => {
                    if (isNotFoundNavigationError(error)) {
                      // We don't want to report "not-found"s
                      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
                    } else if (isRedirectNavigationError(error)) {
                      // We don't want to report redirects
                      span.setStatus({ code: SPAN_STATUS_OK });
                    } else {
                      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                      captureException(error, {
                        mechanism: {
                          handled: false,
                        },
                      });
                    }
                  },
                  () => {
                    span.end();

                    // flushQueue should not throw
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    flushQueue();
                  },
                );
              },
            );
          });
        });
      });
    },
  });
}
