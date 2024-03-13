import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  addTracingExtensions,
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

      return withIsolationScope(isolationScope => {
        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headers ? winterCGHeadersToDict(headers) : undefined,
          },
        });
        isolationScope.setExtra('route_data', data);

        const incomingPropagationContext = propagationContextFromHeaders(
          headers?.get('sentry-trace') ?? undefined,
          headers?.get('baggage'),
        );

        const propagationContext = commonObjectToPropagationContext(headers, incomingPropagationContext);
        isolationScope.setPropagationContext(propagationContext);
        getCurrentScope().setPropagationContext(propagationContext);

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
    },
  });
}
