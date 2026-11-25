import { getClient } from '@sentry/core';
import { captureNitroRequestError } from '@sentry/server-utils';
import type { CapturedErrorContext } from 'nitro/types';

/**
 * Nitro `error` hook that captures the error, unless `enableNitroErrorHandler: false` is set in `Sentry.init()`.
 */
export async function captureErrorHook(error: Error, errorContext: CapturedErrorContext): Promise<void> {
  const sentryClientOptions = getClient()?.getOptions();

  if (
    sentryClientOptions &&
    'enableNitroErrorHandler' in sentryClientOptions &&
    sentryClientOptions.enableNitroErrorHandler === false
  ) {
    return;
  }

  await captureNitroRequestError(error, errorContext);
}
