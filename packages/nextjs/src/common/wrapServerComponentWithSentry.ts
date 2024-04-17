import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  captureException,
  getCurrentScope,
  handleCallbackErrors,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import { propagationContextFromHeaders, winterCGHeadersToDict } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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
      return escapeNextjsTracing(() => {
        const isolationScope = commonObjectToIsolationScope(context.headers);

        const completeHeadersDict: Record<string, string> = context.headers
          ? winterCGHeadersToDict(context.headers)
          : {};

        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: completeHeadersDict,
          },
        });

        const incomingPropagationContext = propagationContextFromHeaders(
          completeHeadersDict['sentry-trace'],
          completeHeadersDict['baggage'],
        );

        const propagationContext = commonObjectToPropagationContext(context.headers, incomingPropagationContext);

        return withIsolationScope(isolationScope, () => {
          getCurrentScope().setPropagationContext(propagationContext);
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
    },
  });
}
