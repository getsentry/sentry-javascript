import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addTracingExtensions,
  captureException,
  continueTrace,
  getClient,
  getCurrentScope,
  handleCallbackErrors,
  runWithAsyncContext,
  startSpanManual,
} from '@sentry/core';
import type { WebFetchHeaders } from '@sentry/types';
import { winterCGHeadersToDict } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { GenerationFunctionContext } from '../common/types';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import { commonObjectToPropagationContext } from './utils/commonObjectTracing';

/**
 * Wraps a generation function (e.g. generateMetadata) with Sentry error and performance instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapGenerationFunctionWithSentry<F extends (...args: any[]) => any>(
  generationFunction: F,
  context: GenerationFunctionContext,
): F {
  addTracingExtensions();
  const { requestAsyncStorage, componentRoute, componentType, generationFunctionIdentifier } = context;
  return new Proxy(generationFunction, {
    apply: (originalFunction, thisArg, args) => {
      let headers: WebFetchHeaders | undefined = undefined;
      // We try-catch here just in case anything goes wrong with the async storage here goes wrong since it is Next.js internal API
      try {
        headers = requestAsyncStorage?.getStore()?.headers;
      } catch (e) {
        /** empty */
      }

      let data: Record<string, unknown> | undefined = undefined;
      if (getClient()?.getOptions().sendDefaultPii) {
        const props: unknown = args[0];
        const params = props && typeof props === 'object' && 'params' in props ? props.params : undefined;
        const searchParams =
          props && typeof props === 'object' && 'searchParams' in props ? props.searchParams : undefined;
        data = { params, searchParams };
      }

      return runWithAsyncContext(() => {
        const transactionContext = continueTrace({
          baggage: headers?.get('baggage'),
          sentryTrace: headers?.get('sentry-trace') ?? undefined,
        });

        // If there is no incoming trace, we are setting the transaction context to one that is shared between all other
        // transactions for this request. We do this based on the `headers` object, which is the same for all components.
        const propagationContext = getCurrentScope().getPropagationContext();
        if (!transactionContext.traceId && !transactionContext.parentSpanId) {
          const { traceId: commonTraceId, spanId: commonSpanId } = commonObjectToPropagationContext(
            headers,
            propagationContext,
          );
          transactionContext.traceId = commonTraceId;
          transactionContext.parentSpanId = commonSpanId;
        }

        return startSpanManual(
          {
            op: 'function.nextjs',
            name: `${componentType}.${generationFunctionIdentifier} (${componentRoute})`,
            ...transactionContext,
            data,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
            },
            metadata: {
              // eslint-disable-next-line deprecation/deprecation
              ...transactionContext.metadata,
              request: {
                headers: headers ? winterCGHeadersToDict(headers) : undefined,
              },
            },
          },
          span => {
            return handleCallbackErrors(
              () => originalFunction.apply(thisArg, args),
              err => {
                if (isNotFoundNavigationError(err)) {
                  // We don't want to report "not-found"s
                  span?.setStatus('not_found');
                } else if (isRedirectNavigationError(err)) {
                  // We don't want to report redirects
                  span?.setStatus('ok');
                } else {
                  span?.setStatus('internal_error');
                  captureException(err, {
                    mechanism: {
                      handled: false,
                      data: {
                        function: 'wrapGenerationFunctionWithSentry',
                      },
                    },
                  });
                }
              },
              () => {
                span?.end();
              },
            );
          },
        );
      });
    },
  });
}
