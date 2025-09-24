import type { RequestEventData } from '@sentry/core';
import {
  captureException,
  getActiveSpan,
  getCapturedScopesOnSpan,
  getClient,
  getRootSpan,
  handleCallbackErrors,
  propagationContextFromHeaders,
  Scope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCapturedScopesOnSpan,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  spanToJSON,
  startSpanManual,
  vercelWaitUntil,
  winterCGHeadersToDict,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';
import { flushSafelyWithTimeout } from '../common/utils/responseEnd';
import { TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL } from './span-attributes-with-logic-attached';
import { addHeadersAsAttributes } from './utils/addHeadersAsAttributes';
import { commonObjectToIsolationScope, commonObjectToPropagationContext } from './utils/tracingUtils';
import { getSanitizedRequestUrl } from './utils/urls';
import { maybeExtractSynchronousParamsAndSearchParams } from './utils/wrapperUtils';

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
      const isolationScope = commonObjectToIsolationScope(context.headers);

      let pathname = undefined as string | undefined;
      const activeSpan = getActiveSpan();
      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        const { scope } = getCapturedScopesOnSpan(rootSpan);
        setCapturedScopesOnSpan(rootSpan, scope ?? new Scope(), isolationScope);

        const spanData = spanToJSON(rootSpan);

        if (spanData.data && 'http.target' in spanData.data) {
          pathname = spanData.data['http.target']?.toString();
        }
      }

      const headersDict = context.headers ? winterCGHeadersToDict(context.headers) : undefined;

      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        addHeadersAsAttributes(context.headers, rootSpan);
      }

      let params: Record<string, string> | undefined = undefined;

      if (getClient()?.getOptions().sendDefaultPii) {
        const props: unknown = args[0];
        const { params: paramsFromProps } = maybeExtractSynchronousParamsAndSearchParams(props);
        params = paramsFromProps;
      }

      isolationScope.setSDKProcessingMetadata({
        normalizedRequest: {
          headers: headersDict,
          url: getSanitizedRequestUrl(componentRoute, params, headersDict, pathname),
        } satisfies RequestEventData,
      });

      return withIsolationScope(isolationScope, () => {
        return withScope(scope => {
          scope.setTransactionName(`${componentType} Server Component (${componentRoute})`);

          if (process.env.NEXT_RUNTIME === 'edge') {
            const propagationContext = commonObjectToPropagationContext(
              context.headers,
              propagationContextFromHeaders(headersDict?.['sentry-trace'], headersDict?.['baggage']),
            );

            if (requestTraceId) {
              propagationContext.traceId = requestTraceId;
            }

            scope.setPropagationContext(propagationContext);
          }

          const activeSpan = getActiveSpan();
          if (activeSpan) {
            const rootSpan = getRootSpan(activeSpan);
            const sentryTrace = headersDict?.['sentry-trace'];
            if (sentryTrace) {
              rootSpan.setAttribute(TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL, sentryTrace);
            }
          }

          return startSpanManual(
            {
              op: 'function.nextjs',
              name: `${componentType} Server Component (${componentRoute})`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.server_component',
                'sentry.nextjs.ssr.function.type': componentType,
                'sentry.nextjs.ssr.function.route': componentRoute,
              },
            },
            span => {
              return handleCallbackErrors(
                () => originalFunction.apply(thisArg, args),
                error => {
                  // When you read this code you might think: "Wait a minute, shouldn't we set the status on the root span too?"
                  // The answer is: "No." - The status of the root span is determined by whatever status code Next.js decides to put on the response.
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
                        type: 'auto.function.nextjs.server_component',
                      },
                    });
                  }
                },
                () => {
                  span.end();
                  vercelWaitUntil(flushSafelyWithTimeout());
                },
              );
            },
          );
        });
      });
    },
  });
}
