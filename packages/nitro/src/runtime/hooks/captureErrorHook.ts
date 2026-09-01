import { captureException, getClient, parseUrl } from '@sentry/core';
import { flushIfServerless } from '@sentry/server-utils';
import { HTTPError } from 'h3';
import type { CapturedErrorContext } from 'nitro/types';

/**
 * Extracts the relevant context information from the error context (HTTPEvent in Nitro Error)
 * and creates a structured context object.
 */
function extractErrorContext(errorContext: CapturedErrorContext | undefined): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  if (!errorContext) {
    return ctx;
  }

  if (errorContext.event) {
    ctx.method = errorContext.event.req.method;
    ctx.path = parseUrl(errorContext.event.req.url).path;
  }

  if (Array.isArray(errorContext.tags)) {
    ctx.tags = errorContext.tags;
  }

  return ctx;
}

/**
 * Hook that can be added in a Nitro plugin. It captures an error and sends it to Sentry.
 */
export async function captureErrorHook(error: Error, errorContext: CapturedErrorContext): Promise<void> {
  const sentryClient = getClient();
  const sentryClientOptions = sentryClient?.getOptions();

  if (
    sentryClientOptions &&
    'enableNitroErrorHandler' in sentryClientOptions &&
    sentryClientOptions.enableNitroErrorHandler === false
  ) {
    return;
  }

  // Do not report HTTPErrors with 3xx or 4xx status codes
  if (HTTPError.isError(error) && error.status >= 300 && error.status < 500) {
    return;
  }

  const structuredContext = extractErrorContext(errorContext);

  captureException(error, {
    captureContext: { contexts: { nitro: structuredContext } },
    mechanism: { handled: false, type: 'auto.function.nitro.captureErrorHook' },
  });

  await flushIfServerless();
}
