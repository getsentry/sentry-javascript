import { captureException, flushIfServerless, getClient, getCurrentScope } from '@sentry/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { H3Error } from 'h3';
import type { CapturedErrorContext } from 'nitropack/types';
import { extractErrorContext } from '../utils';

/**
 *  Hook that can be added in a Nitro plugin. It captures an error and sends it to Sentry.
 */
export async function sentryCaptureErrorHook(error: Error, errorContext: CapturedErrorContext): Promise<void> {
  const sentryClient = getClient();
  const sentryClientOptions = sentryClient?.getOptions();

  if (
    sentryClientOptions &&
    'enableNitroErrorHandler' in sentryClientOptions &&
    sentryClientOptions.enableNitroErrorHandler === false
  ) {
    return;
  }

  // Do not handle 404 and 422
  if (error instanceof H3Error) {
    // Do not report if status code is 3xx or 4xx
    if (error.statusCode >= 300 && error.statusCode < 500) {
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
}
