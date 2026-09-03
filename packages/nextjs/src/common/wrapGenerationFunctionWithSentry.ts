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
import type { GenerationFunctionContext } from '../common/types';
import {
  isNotFoundNavigationError,
  isPrerenderControlFlowError,
  isRedirectNavigationError,
} from './nextNavigationErrorUtils';
import { flushSafelyWithTimeout, waitUntil } from './utils/responseEnd';

/**
 * Wraps a generation function (e.g. generateMetadata) with Sentry error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapGenerationFunctionWithSentry<F extends (...args: any[]) => any>(
  generationFunction: F,
  context: GenerationFunctionContext,
): F {
  return new Proxy(generationFunction, {
    apply: (originalFunction, thisArg, args) => {
      const isolationScope = getIsolationScope();

      let headers = undefined;
      // We try-catch here just in case anything goes wrong with the async storage since it is Next.js internal API
      try {
        headers = context.requestAsyncStorage?.getStore()?.headers;
      } catch {
        /** empty */
      }

      const headersDict = headers ? winterCGHeadersToDict(headers) : undefined;

      isolationScope.setSDKProcessingMetadata({
        normalizedRequest: {
          headers: headersDict,
        } satisfies RequestEventData,
      });

      return handleCallbackErrors(
        () => originalFunction.apply(thisArg, args),
        error => {
          const span = getActiveSpan();
          const { componentRoute, componentType, generationFunctionIdentifier } = context;
          isolationScope.setTransactionName(`${componentType}.${generationFunctionIdentifier} (${componentRoute})`);

          // Next.js uses thrown errors for control flow. Whether or not we happen to have an active span here
          // must not decide if we report them, so these checks deliberately run outside of the span handling.
          if (isNotFoundNavigationError(error)) {
            // We don't want to report "not-found"s
            span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
            return;
          }

          if (isRedirectNavigationError(error)) {
            // We don't want to report redirects
            span?.setStatus({ code: SPAN_STATUS_OK });
            return;
          }

          if (isPrerenderControlFlowError(error)) {
            // Next.js aborts prerenders by rejecting the promises it handed out. React discards those rejections,
            // so they are expected, do not affect the response, and must not be reported.
            return;
          }

          span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });

          captureException(error, {
            mechanism: {
              handled: false,
              type: 'auto.function.nextjs.generation_function',
              data: {
                function: generationFunctionIdentifier,
              },
            },
          });
        },
        () => {
          waitUntil(flushSafelyWithTimeout());
        },
      );
    },
  });
}
