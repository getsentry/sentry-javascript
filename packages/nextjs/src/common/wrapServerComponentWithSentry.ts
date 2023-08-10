import {
  addTracingExtensions,
  captureException,
  getCurrentHub,
  runWithAsyncContext,
  startTransaction,
} from '@sentry/core';
import { tracingContextFromHeaders } from '@sentry/utils';

import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';

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

        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          context.sentryTraceHeader,
          context.baggageHeader,
        );
        currentScope.setPropagationContext(propagationContext);

        const transaction = startTransaction({
          op: 'function.nextjs',
          name: `${componentType} Server Component (${componentRoute})`,
          status: 'ok',
          origin: 'auto.function.nextjs',
          ...traceparentData,
          metadata: {
            source: 'component',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          },
        });

        if (currentScope) {
          currentScope.setSpan(transaction);
        }

        const handleErrorCase = (e: unknown): void => {
          if (isNotFoundNavigationError(e)) {
            // We don't want to report "not-found"s
            transaction.setStatus('not_found');
          } else if (isRedirectNavigationError(e)) {
            // We don't want to report redirects
          } else {
            transaction.setStatus('internal_error');
            captureException(e);
          }

          transaction.finish();
        };

        try {
          maybePromiseResult = originalFunction.apply(thisArg, args);
        } catch (e) {
          handleErrorCase(e);
          throw e;
        }

        if (typeof maybePromiseResult === 'object' && maybePromiseResult !== null && 'then' in maybePromiseResult) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          Promise.resolve(maybePromiseResult).then(
            () => {
              transaction.finish();
            },
            e => {
              handleErrorCase(e);
            },
          );

          // It is very important that we return the original promise here, because Next.js attaches various properties
          // to that promise and will throw if they are not on the returned value.
          return maybePromiseResult;
        } else {
          transaction.finish();
          return maybePromiseResult;
        }
      });
    },
  });
}
