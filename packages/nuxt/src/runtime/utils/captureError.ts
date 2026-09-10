import { captureException, getClient, getCurrentScope } from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import type { CapturedErrorContext } from 'nitropack/types';
import { extractErrorContext } from '../utils';

/**
 * Reads the HTTP status off an error thrown by the server framework, or returns `undefined` for
 * anything that is not one. h3 v1 (`H3Error.statusCode`) and h3 v2 (`HTTPError.status`) disagree on
 * both the class and the field, so each Nitro variant passes in its own.
 */
export type GetHttpErrorStatus = (error: Error) => number | undefined;

/**
 * Builds the hook a Nitro plugin registers on `error`. It captures the error and sends it to Sentry.
 */
export function createCaptureErrorHook(
  getHttpErrorStatus: GetHttpErrorStatus,
): (error: Error, errorContext: CapturedErrorContext) => Promise<void> {
  return async function sentryCaptureErrorHook(error, errorContext): Promise<void> {
    const sentryClient = getClient();
    const sentryClientOptions = sentryClient?.getOptions();

    if (
      sentryClientOptions &&
      'enableNitroErrorHandler' in sentryClientOptions &&
      sentryClientOptions.enableNitroErrorHandler === false
    ) {
      return;
    }

    const status = getHttpErrorStatus(error);

    if (status !== undefined) {
      // Do not report if status code is 3xx or 4xx
      if (status >= 300 && status < 500) {
        return;
      }

      // Check if the cause (original error) was already captured by middleware instrumentation
      // H3 wraps errors, so we need to check the cause property
      if (
        'cause' in error &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        '__sentry_captured__' in error.cause
      ) {
        return;
      }
    }

    const { method, path } = {
      method: errorContext.event?._method ? errorContext.event._method : '',
      path: errorContext.event?._path ? errorContext.event._path : null,
    };

    if (path) {
      getCurrentScope().setTransactionName(`${method} ${path}`);
    }

    const structuredContext = extractErrorContext(errorContext);

    captureException(error, {
      captureContext: { contexts: { nuxt: structuredContext } },
      mechanism: { handled: false, type: 'auto.function.nuxt.nitro' },
    });

    await flushIfServerless();
  };
}
