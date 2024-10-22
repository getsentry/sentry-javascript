import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  captureException,
  continueTrace,
  getClient,
  getIsolationScope,
  handleCallbackErrors,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { logger, vercelWaitUntil } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import { flushSafelyWithTimeout } from './utils/responseEnd';

interface Options {
  formData?: FormData;

  /**
   * Headers as returned from `headers()`.
   *
   * Currently accepts both a plain `Headers` object and `Promise<ReadonlyHeaders>` to be compatible with async APIs introduced in Next.js 15: https://github.com/vercel/next.js/pull/68812
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headers?: Headers | Promise<any>;

  /**
   * Whether the server action response should be included in any events captured within the server action.
   */
  recordResponse?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withServerActionInstrumentation<A extends (...args: any[]) => any>(
  serverActionName: string,
  callback: A,
): Promise<ReturnType<A>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withServerActionInstrumentation<A extends (...args: any[]) => any>(
  serverActionName: string,
  options: Options,
  callback: A,
): Promise<ReturnType<A>>;

/**
 * Wraps a Next.js Server Action implementation with Sentry Error and Performance instrumentation.
 */
export function withServerActionInstrumentation<A extends (...args: unknown[]) => unknown>(
  ...args: [string, Options, A] | [string, A]
): Promise<ReturnType<A>> {
  if (typeof args[1] === 'function') {
    const [serverActionName, callback] = args;
    return withServerActionInstrumentationImplementation(serverActionName, {}, callback);
  } else {
    const [serverActionName, options, callback] = args;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return withServerActionInstrumentationImplementation(serverActionName, options, callback!);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withServerActionInstrumentationImplementation<A extends (...args: any[]) => any>(
  serverActionName: string,
  options: Options,
  callback: A,
): Promise<ReturnType<A>> {
  return withIsolationScope(async isolationScope => {
    const sendDefaultPii = getClient()?.getOptions().sendDefaultPii;

    let sentryTraceHeader;
    let baggageHeader;
    const fullHeadersObject: Record<string, string> = {};
    try {
      const awaitedHeaders: Headers = await options.headers;
      sentryTraceHeader = awaitedHeaders?.get('sentry-trace') ?? undefined;
      baggageHeader = awaitedHeaders?.get('baggage');
      awaitedHeaders?.forEach((value, key) => {
        fullHeadersObject[key] = value;
      });
    } catch (e) {
      DEBUG_BUILD &&
        logger.warn(
          "Sentry wasn't able to extract the tracing headers for a server action. Will not trace this request.",
        );
    }

    isolationScope.setTransactionName(`serverAction/${serverActionName}`);
    isolationScope.setSDKProcessingMetadata({
      request: {
        headers: fullHeadersObject,
      },
    });

    return continueTrace(
      {
        sentryTrace: sentryTraceHeader,
        baggage: baggageHeader,
      },
      async () => {
        try {
          return await startSpan(
            {
              op: 'function.server_action',
              name: `serverAction/${serverActionName}`,
              forceTransaction: true,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              },
            },
            async span => {
              const result = await handleCallbackErrors(callback, error => {
                if (isNotFoundNavigationError(error)) {
                  // We don't want to report "not-found"s
                  span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
                } else if (isRedirectNavigationError(error)) {
                  // Don't do anything for redirects
                } else {
                  span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                  captureException(error, {
                    mechanism: {
                      handled: false,
                    },
                  });
                }
              });

              if (options.recordResponse !== undefined ? options.recordResponse : sendDefaultPii) {
                getIsolationScope().setExtra('server_action_result', result);
              }

              if (options.formData) {
                options.formData.forEach((value, key) => {
                  getIsolationScope().setExtra(
                    `server_action_form_data.${key}`,
                    typeof value === 'string' ? value : '[non-string value]',
                  );
                });
              }

              return result;
            },
          );
        } finally {
          vercelWaitUntil(flushSafelyWithTimeout());
        }
      },
    );
  });
}
