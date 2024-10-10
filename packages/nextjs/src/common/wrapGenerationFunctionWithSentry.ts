import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  Scope,
  captureException,
  getActiveSpan,
  getCapturedScopesOnSpan,
  getClient,
  getRootSpan,
  handleCallbackErrors,
  setCapturedScopesOnSpan,
  startSpanManual,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import type { WebFetchHeaders } from '@sentry/types';
import { propagationContextFromHeaders, uuid4, winterCGHeadersToDict } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { GenerationFunctionContext } from '../common/types';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import { TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL } from './span-attributes-with-logic-attached';
import { commonObjectToIsolationScope, commonObjectToPropagationContext } from './utils/tracingUtils';

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
      } catch (e) {
        /** empty */
      }

      const isolationScope = commonObjectToIsolationScope(headers);

      const activeSpan = getActiveSpan();
      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        const { scope } = getCapturedScopesOnSpan(rootSpan);
        setCapturedScopesOnSpan(rootSpan, scope ?? new Scope(), isolationScope);
      }

      let data: Record<string, unknown> | undefined = undefined;
      if (getClient()?.getOptions().sendDefaultPii) {
        const props: unknown = args[0];
        const params = props && typeof props === 'object' && 'params' in props ? props.params : undefined;
        const searchParams =
          props && typeof props === 'object' && 'searchParams' in props ? props.searchParams : undefined;
        data = { params, searchParams };
      }

      const headersDict = headers ? winterCGHeadersToDict(headers) : undefined;

      return withIsolationScope(isolationScope, () => {
        return withScope(scope => {
          scope.setTransactionName(`${componentType}.${generationFunctionIdentifier} (${componentRoute})`);

          isolationScope.setSDKProcessingMetadata({
            request: {
              headers: headersDict,
            },
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
            headersDict?.['sentry-trace']
              ? propagationContextFromHeaders(headersDict['sentry-trace'], headersDict['baggage'])
              : {
                  traceId: requestTraceId || uuid4(),
                  spanId: uuid4().substring(16),
                },
          );
          scope.setPropagationContext(propagationContext);

          scope.setExtra('route_data', data);

          return startSpanManual(
            {
              op: 'function.nextjs',
              name: `${componentType}.${generationFunctionIdentifier} (${componentRoute})`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
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
