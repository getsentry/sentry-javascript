import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addTracingExtensions,
  captureException,
  getClient,
  getCurrentScope,
  handleCallbackErrors,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import type { SpanAttributes, WebFetchHeaders } from '@sentry/types';
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

      const attributes: SpanAttributes | undefined = {};
      if (getClient()?.getOptions().sendDefaultPii) {
        const props: unknown = args[0];
        const params = hasParams(props) ? props.params : {};
        const searchParams = hasSearchParams(props) ? props.searchParams : {};

        addObjectToAttributes(attributes, 'params', params);
        addObjectToAttributes(attributes, 'searchParams', searchParams);
      }

      return withIsolationScope(isolationScope => {
        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: headers ? winterCGHeadersToDict(headers) : undefined,
          },
        });
        isolationScope.setExtra('route_data', attributes);

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
              ...attributes,
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

function hasParams(props: unknown): props is { params: Record<string, unknown> } {
  return !!props && typeof props === 'object' && 'params' in props;
}

function hasSearchParams(props: unknown): props is { searchParams: Record<string, unknown> } {
  return !!props && typeof props === 'object' && 'params' in props;
}

function addObjectToAttributes(
  attributes: SpanAttributes,
  prefix: string,
  obj: Record<string, unknown>,
): SpanAttributes {
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      attributes[`${prefix}.${key}`] = val;
    }
  });
  return attributes;
}
