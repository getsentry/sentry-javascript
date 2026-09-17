import { captureException, getClient, getCurrentScope } from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import type { CapturedErrorContext } from 'nitropack/types';
import { extractErrorContext, getEventRequestInfo } from '../utils';

/**
 * Returns the status code of an error thrown by h3, or `undefined` for any other error.
 *
 * Mirrors each h3 major's own `isError` instead of importing h3: an `h3` import puts this module
 * behind Nuxt 5's transitional Nitro v2 compatibility layer, and `nitro/h3` does not resolve on Nuxt 3/4.
 * h3 v2 (Nitro v3) recognizes its errors by name and stores the code on
 * `status`, h3 v1 (Nitro v2) by a static flag on the class and on `statusCode`.
 */
function getH3ErrorStatusCode(error: Error): number | undefined {
  const isH3Error =
    error.name === 'HTTPError' || (error.constructor as { __h3_error__?: boolean } | undefined)?.__h3_error__ === true;

  if (!isH3Error) {
    return undefined;
  }

  const { status, statusCode } = error as { status?: number; statusCode?: number };
  return status ?? statusCode;
}


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

  const statusCode = getH3ErrorStatusCode(error);

  // Do not handle 404 and 422
  if (statusCode !== undefined) {
    // Do not report if status code is 3xx or 4xx
    if (statusCode >= 300 && statusCode < 500) {
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

  const { method = '', path } = getEventRequestInfo(errorContext.event);

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
