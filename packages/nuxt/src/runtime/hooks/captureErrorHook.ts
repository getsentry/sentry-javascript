import * as SentryNode from '@sentry/node';
import { H3Error } from 'h3';
import { extractErrorContext, flushIfServerless } from '../utils';
import type { CapturedErrorContext } from 'nitropack';

/**
 *  Hook that can be added in a Nitro plugin. It captures an error and sends it to Sentry.
 */
export async function sentryCaptureErrorHook(error: Error, errorContext: CapturedErrorContext): Promise<void> {
  const sentryClient = SentryNode.getClient();
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
  }

  const { method, path } = {
    method: errorContext.event?._method ? errorContext.event._method : '',
    path: errorContext.event?._path ? errorContext.event._path : null,
  };

  if (path) {
    SentryNode.getCurrentScope().setTransactionName(`${method} ${path}`);
  }

  const structuredContext = extractErrorContext(errorContext);

  SentryNode.captureException(error, {
    captureContext: { contexts: { nuxt: structuredContext } },
    mechanism: { handled: false },
  });

  await flushIfServerless();
}
