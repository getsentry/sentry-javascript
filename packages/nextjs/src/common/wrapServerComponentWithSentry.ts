import {
  addTracingExtensions,
  captureException,
  continueTrace,
  getCurrentScope,
  runWithAsyncContext,
  trace,
} from '@sentry/core';
import { winterCGHeadersToDict } from '@sentry/utils';

import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';
import { commonObjectToPropagationContext } from './utils/commonObjectTracing';
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
        const completeHeadersDict: Record<string, string> = context.headers
          ? winterCGHeadersToDict(context.headers)
          : {};

        const transactionContext = continueTrace({
          // eslint-disable-next-line deprecation/deprecation
          sentryTrace: context.sentryTraceHeader ?? completeHeadersDict['sentry-trace'],
          // eslint-disable-next-line deprecation/deprecation
          baggage: context.baggageHeader ?? completeHeadersDict['baggage'],
        });

        const propagationContext = getCurrentScope().getPropagationContext();

        if (!transactionContext.traceId && !transactionContext.parentSpanId) {
          const { traceId: commonTraceId, spanId: commonSpanId } = commonObjectToPropagationContext(
            context.headers,
            propagationContext,
          );
          transactionContext.traceId = commonTraceId;
          transactionContext.parentSpanId = commonSpanId;
        }

        const res = trace(
          {
            ...transactionContext,
            op: 'function.nextjs',
            name: `${componentType} Server Component (${componentRoute})`,
            status: 'ok',
            origin: 'auto.function.nextjs',
            metadata: {
              ...transactionContext.metadata,
              request: {
                headers: completeHeadersDict,
              },
              source: 'component',
            },
          },
          () => originalFunction.apply(thisArg, args),
          (e, span) => {
            if (isNotFoundNavigationError(e)) {
              // We don't want to report "not-found"s
              span?.setStatus('not_found');
            } else if (isRedirectNavigationError(e)) {
              // We don't want to report redirects
            } else {
              span?.setStatus('internal_error');

              captureException(e, {
                mechanism: {
                  handled: false,
                },
              });
            }
          },
          () => {
            void flushQueue();
          },
        );

        return res;
      });
    },
  });
}
