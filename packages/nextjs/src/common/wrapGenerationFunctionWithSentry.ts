import type { RequestEventData, WebFetchHeaders } from '@sentry/core';
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
  winterCGHeadersToDict,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import type { GenerationFunctionContext } from '../common/types';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import { TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL } from './span-attributes-with-logic-attached';
import { addHeadersAsAttributes } from './utils/addHeadersAsAttributes';
import { commonObjectToIsolationScope, commonObjectToPropagationContext } from './utils/tracingUtils';
import { getSanitizedRequestUrl } from './utils/urls';
import { maybeExtractSynchronousParamsAndSearchParams } from './utils/wrapperUtils';
/**
 * Wraps a generation function (e.g. generateMetadata) with Sentry error and performance instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapGenerationFunctionWithSentry<F extends (...args: any[]) => any>(
  generationFunction: F,
  context: GenerationFunctionContext,
): F {
  const { requestAsyncStorage, componentRoute, componentType, generationFunctionIdentifier } = context;
  return new Proxy(generationFunction, {
    apply: (originalFunction, thisArg, args) => {
      const requestTraceId = getActiveSpan()?.spanContext().traceId;
      let headers: WebFetchHeaders | undefined = undefined;
      // We try-catch here just in case anything goes wrong with the async storage here goes wrong since it is Next.js internal API
      try {
        headers = requestAsyncStorage?.getStore()?.headers;
      } catch {
        /** empty */
      }

      const isolationScope = commonObjectToIsolationScope(headers);
      let pathname = undefined as string | undefined;

      const activeSpan = getActiveSpan();
      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        const { scope } = getCapturedScopesOnSpan(rootSpan);
        setCapturedScopesOnSpan(rootSpan, scope ?? new Scope(), isolationScope);

        const spanData = spanToJSON(rootSpan);

        if (spanData.data && 'http.target' in spanData.data) {
          pathname = spanData.data['http.target'] as string;
        }
      }

      const headersDict = headers ? winterCGHeadersToDict(headers) : undefined;

      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        addHeadersAsAttributes(headers, rootSpan);
      }

      let data: Record<string, unknown> | undefined = undefined;
      if (getClient()?.getOptions().sendDefaultPii) {
        const props: unknown = args[0];
        const { params, searchParams } = maybeExtractSynchronousParamsAndSearchParams(props);
        data = { params, searchParams };
      }

      return withIsolationScope(isolationScope, () => {
        return withScope(scope => {
          scope.setTransactionName(`${componentType}.${generationFunctionIdentifier} (${componentRoute})`);

          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: {
              headers: headersDict,
              url: getSanitizedRequestUrl(
                componentRoute,
                data?.params as Record<string, string> | undefined,
                headersDict,
                pathname,
              ),
            } satisfies RequestEventData,
          });

          const activeSpan = getActiveSpan();
          if (activeSpan) {
            const rootSpan = getRootSpan(activeSpan);
            const sentryTrace = headersDict?.['sentry-trace'];
            if (sentryTrace) {
              rootSpan.setAttribute(TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL, sentryTrace);
            }
          }

          const propagationContext = commonObjectToPropagationContext(
            headers,
            propagationContextFromHeaders(headersDict?.['sentry-trace'], headersDict?.['baggage']),
          );

          if (requestTraceId) {
            propagationContext.traceId = requestTraceId;
          }

          scope.setPropagationContext(propagationContext);

          scope.setExtra('route_data', data);

          return startSpanManual(
            {
              op: 'function.nextjs',
              name: `${componentType}.${generationFunctionIdentifier} (${componentRoute})`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
                'sentry.nextjs.ssr.function.type': generationFunctionIdentifier,
                'sentry.nextjs.ssr.function.route': componentRoute,
              },
            },
            span => {
              return handleCallbackErrors(
                () => originalFunction.apply(thisArg, args),
                err => {
                  // When you read this code you might think: "Wait a minute, shouldn't we set the status on the root span too?"
                  // The answer is: "No." - The status of the root span is determined by whatever status code Next.js decides to put on the response.
                  if (isNotFoundNavigationError(err)) {
                    // We don't want to report "not-found"s
                    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
                    getRootSpan(span).setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
                  } else if (isRedirectNavigationError(err)) {
                    // We don't want to report redirects
                    span.setStatus({ code: SPAN_STATUS_OK });
                  } else {
                    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                    getRootSpan(span).setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                    captureException(err, {
                      mechanism: {
                        handled: false,
                      },
                    });
                  }
                },
                () => {
                  span.end();
                },
              );
            },
          );
        });
      });
    },
  });
}
