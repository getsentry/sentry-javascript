import {
  addTracingExtensions,
  captureException,
  getCurrentHub,
  runWithAsyncContext,
  startTransaction,
} from '@sentry/core';
import { tracingContextFromHeaders, winterCGHeadersToDict } from '@sentry/utils';

import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';
import { flushQueue } from './utils/responseEnd';

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerComponentWithSentry<F extends (...args: any[]) => any>(
  appDirComponent: F,
  context: ServerComponentContext,
): F {
  addTracingExtensions();
  const { componentRoute, componentType } = context;

  // Even though users may define server components as async functions, for the client bundles
  // Next.js will turn them into synchronous functions and it will transform any `await`s into instances of the `use`
  // hook. 🤯
  return new Proxy(appDirComponent, {
    apply: (originalFunction, thisArg, args) => {
      return runWithAsyncContext(() => {
        const hub = getCurrentHub();
        const currentScope = hub.getScope();

        let maybePromiseResult;

        const completeHeadersDict: Record<string, string> = context.headers
          ? winterCGHeadersToDict(context.headers)
          : {};

        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          // eslint-disable-next-line deprecation/deprecation
          context.sentryTraceHeader ?? completeHeadersDict['sentry-trace'],
          // eslint-disable-next-line deprecation/deprecation
          context.baggageHeader ?? completeHeadersDict['baggage'],
        );
        currentScope.setPropagationContext(propagationContext);

        const transaction = startTransaction({
          op: 'function.nextjs',
          name: `${componentType} Server Component (${componentRoute})`,
          status: 'ok',
          origin: 'auto.function.nextjs',
          ...traceparentData,
          metadata: {
            request: {
              headers: completeHeadersDict,
            },
            source: 'component',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          },
        });

        currentScope.setSpan(transaction);

        const handleErrorCase = (e: unknown): void => {
          if (isNotFoundNavigationError(e)) {
            // We don't want to report "not-found"s
            transaction.setStatus('not_found');
          } else if (isRedirectNavigationError(e)) {
            // We don't want to report redirects
          } else {
            transaction.setStatus('internal_error');

            captureException(e, {
              mechanism: {
                handled: false,
              },
            });
          }

          transaction.finish();
        };

        try {
          maybePromiseResult = originalFunction.apply(thisArg, args);
        } catch (e) {
          handleErrorCase(e);
          void flushQueue();
          throw e;
        }

        if (typeof maybePromiseResult === 'object' && maybePromiseResult !== null && 'then' in maybePromiseResult) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          Promise.resolve(maybePromiseResult)
            .then(
              () => {
                transaction.finish();
              },
              e => {
                handleErrorCase(e);
              },
            )
            .finally(() => {
              void flushQueue();
            });

          // It is very important that we return the original promise here, because Next.js attaches various properties
          // to that promise and will throw if they are not on the returned value.
          return maybePromiseResult;
        } else {
          transaction.finish();
          void flushQueue();
          return maybePromiseResult;
        }
      });
    },
  });
}
