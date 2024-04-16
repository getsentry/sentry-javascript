import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  captureException,
  getClient,
  getCurrentScope,
  handleCallbackErrors,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import type { WebFetchHeaders } from '@sentry/types';
import { propagationContextFromHeaders, winterCGHeadersToDict } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { GenerationFunctionContext } from '../common/types';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import {
  commonObjectToIsolationScope,
  commonObjectToPropagationContext,
  escapeNextjsTracing,
} from './utils/tracingUtils';

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
      return escapeNextjsTracing(() => {
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

        const incomingPropagationContext = propagationContextFromHeaders(
          headers?.get('sentry-trace') ?? undefined,
          headers?.get('baggage'),
        );

        const isolationScope = commonObjectToIsolationScope(headers);
        const propagationContext = commonObjectToPropagationContext(headers, incomingPropagationContext);

        return withIsolationScope(isolationScope, () => {
          isolationScope.setSDKProcessingMetadata({
            request: {
              headers: headers ? winterCGHeadersToDict(headers) : undefined,
            },
          });

          getCurrentScope().setExtra('route_data', data);
          getCurrentScope().setPropagationContext(propagationContext);

          return startSpanManual(
            {
              op: 'function.nextjs',
              name: `${componentType}.${generationFunctionIdentifier} (${componentRoute})`,
              forceTransaction: true,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
              },
            },
            span => {
              return handleCallbackErrors(
                () => originalFunction.apply(thisArg, args),
                err => {
                  if (isNotFoundNavigationError(err)) {
                    // We don't want to report "not-found"s
                    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
                  } else if (isRedirectNavigationError(err)) {
                    // We don't want to report redirects
                    span.setStatus({ code: SPAN_STATUS_OK });
                  } else {
                    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
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
