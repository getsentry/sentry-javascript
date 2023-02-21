import { captureException, getCurrentHub, startTransaction } from '@sentry/core';
import { baggageHeaderToDynamicSamplingContext, extractTraceparentData } from '@sentry/utils';
import * as domain from 'domain';

import type { ServerComponentContext } from '../common/types';

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
export function wrapServerComponentWithSentry<F extends (...args: any[]) => any>(
  appDirComponent: F,
  context: ServerComponentContext,
): F {
  const { componentRoute, componentType, sentryTraceHeader, baggageHeader } = context;

  // Even though users may define server components as async functions, for the client bundles
  // Next.js will turn them into synchronous functions and it will transform any `await`s into instances of the `use`
  // hook. 🤯
  return new Proxy(appDirComponent, {
    apply: (originalFunction, thisArg, args) => {
      return domain.create().bind(() => {
        let maybePromiseResult;

        const traceparentData =
          typeof sentryTraceHeader === 'string' ? extractTraceparentData(sentryTraceHeader) : undefined;

        const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

        const transaction = startTransaction({
          op: 'function.nextjs',
          name: `${componentType} Server Component (${componentRoute})`,
          ...traceparentData,
          status: 'ok',
          metadata: {
            source: 'component',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          },
        });

        const currentScope = getCurrentHub().getScope();
        if (currentScope) {
          currentScope.setSpan(transaction);
        }

        try {
          maybePromiseResult = originalFunction.apply(thisArg, args);
        } catch (e) {
          transaction.setStatus('internal_error');
          captureException(e);
          transaction.finish();
          throw e;
        }

        if (typeof maybePromiseResult === 'object' && maybePromiseResult !== null && 'then' in maybePromiseResult) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return maybePromiseResult.then(
            (res: unknown) => {
              transaction.finish();
              return res;
            },
            (e: Error) => {
              transaction.setStatus('internal_error');
              captureException(e);
              transaction.finish();
              throw e;
            },
          );
        } else {
          transaction.finish();
          return maybePromiseResult;
        }
      })();
    },
  });
}
