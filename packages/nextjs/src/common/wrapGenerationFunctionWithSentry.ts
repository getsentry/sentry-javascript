import {
  addTracingExtensions,
  captureException,
  continueTrace,
  getClient,
  getCurrentScope,
  runWithAsyncContext,
  trace,
} from '@sentry/core';
import type { WebFetchHeaders } from '@sentry/types';
import { winterCGHeadersToDict } from '@sentry/utils';

import type { GenerationFunctionContext } from '../common/types';
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

        return trace(
          {
            op: 'function.nextjs',
            name: `${componentType}.${generationFunctionIdentifier} (${componentRoute})`,
            origin: 'auto.function.nextjs',
            ...transactionContext,
            data,
            metadata: {
              ...transactionContext.metadata,
              source: 'url',
              request: {
                headers: headers ? winterCGHeadersToDict(headers) : undefined,
              },
            },
          },
          () => {
            return originalFunction.apply(thisArg, args);
          },
          err => {
            captureException(err, {
              mechanism: {
                handled: false,
                data: {
                  function: 'wrapGenerationFunctionWithSentry',
                },
              },
            });
          },
        );
      });
    },
  });
}
