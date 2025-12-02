import type { RequestEventData } from '@sentry/core';
import { captureException, handleCallbackErrors, winterCGHeadersToDict, withIsolationScope } from '@sentry/core';
import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';
import { flushSafelyWithTimeout, waitUntil } from '../common/utils/responseEnd';
import { commonObjectToIsolationScope } from './utils/tracingUtils';

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerComponentWithSentry<F extends (...args: any[]) => any>(
  appDirComponent: F,
  context: ServerComponentContext,
): F {
  // Even though users may define server components as async functions, for the client bundles
  // Next.js will turn them into synchronous functions and it will transform any `await`s into instances of the `use`
  // hook. 🤯
  return new Proxy(appDirComponent, {
    apply: (originalFunction, thisArg, args) => {
      const isolationScope = commonObjectToIsolationScope(context.headers);

      const headersDict = context.headers ? winterCGHeadersToDict(context.headers) : undefined;

      isolationScope.setSDKProcessingMetadata({
        normalizedRequest: {
          headers: headersDict,
        } satisfies RequestEventData,
      });

      return withIsolationScope(isolationScope, () => {
        return handleCallbackErrors(
          () => originalFunction.apply(thisArg, args),
          error => {
            if (isNotFoundNavigationError(error)) {
              // We don't want to report "not-found"s
            } else if (isRedirectNavigationError(error)) {
              // We don't want to report redirects
            } else {
              captureException(error, {
                mechanism: {
                  handled: false,
                  type: 'auto.function.nextjs.server_component',
                },
              });
            }
          },
          () => {
            waitUntil(flushSafelyWithTimeout());
          },
        );
      });
    },
  });
}
