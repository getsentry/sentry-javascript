import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, SPAN_STATUS_ERROR, getIsolationScope } from '@sentry/core';
import {
  addTracingExtensions,
  captureException,
  continueTrace,
  getClient,
  handleCallbackErrors,
  startSpan,
} from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';
import { withIsolationScopeOrReuseFromRootSpan } from './utils/withIsolationScopeOrReuseFromRootSpan';

interface Options {
  formData?: FormData;
  // TODO: Whenever we decide to drop support for Next.js <= 12 we can automatically pick up the headers becauase "next/headers" will be resolvable.
  headers?: Headers;
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
  addTracingExtensions();
  return withIsolationScopeOrReuseFromRootSpan(isolationScope => {
    const sendDefaultPii = getClient()?.getOptions().sendDefaultPii;

    let sentryTraceHeader;
    let baggageHeader;
    const fullHeadersObject: Record<string, string> = {};
    try {
      sentryTraceHeader = options.headers?.get('sentry-trace') ?? undefined;
      baggageHeader = options.headers?.get('baggage');
      options.headers?.forEach((value, key) => {
        fullHeadersObject[key] = value;
      });
    } catch (e) {
      DEBUG_BUILD &&
        logger.warn(
          "Sentry wasn't able to extract the tracing headers for a server action. Will not trace this request.",
        );
    }

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
          if (!platformSupportsStreaming()) {
            // Lambdas require manual flushing to prevent execution freeze before the event is sent
            await flushQueue();
          }

          if (process.env.NEXT_RUNTIME === 'edge') {
            // flushQueue should not throw
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            flushQueue();
          }
        }
      },
    );
  });
}
