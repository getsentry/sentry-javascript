import type { RequestEventData } from '@sentry/core';
import {
  captureException,
  getActiveSpan,
  getIsolationScope,
  handleCallbackErrors,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  winterCGHeadersToDict,
} from '@sentry/core';
import { isNotFoundNavigationError, isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import type { ServerComponentContext } from '../common/types';
import { flushSafelyWithTimeout, waitUntil } from '../common/utils/responseEnd';

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
      const isolationScope = getIsolationScope();

      const headersDict = context.headers ? winterCGHeadersToDict(context.headers) : undefined;

      isolationScope.setSDKProcessingMetadata({
        normalizedRequest: {
          headers: headersDict,
        } satisfies RequestEventData,
      });

      return handleCallbackErrors(
        () => originalFunction.apply(thisArg, args),
        error => {
          const span = getActiveSpan();
          const { componentRoute, componentType } = context;
          let shouldCapture = true;
          isolationScope.setTransactionName(`${componentType} Server Component (${componentRoute})`);

          if (span) {
            if (isNotFoundNavigationError(error)) {
              // We don't want to report "not-found"s
              shouldCapture = false;
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
            } else if (isRedirectNavigationError(error)) {
              // We don't want to report redirects
              shouldCapture = false;
              span.setStatus({ code: SPAN_STATUS_OK });
            } else {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            }
          }

          if (shouldCapture) {
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
    },
  });
}
