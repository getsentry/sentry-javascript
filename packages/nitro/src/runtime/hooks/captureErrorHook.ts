import { captureException, flushIfServerless, getClient, getCurrentScope } from '@sentry/core';
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

    try {
      const url = new URL(errorContext.event.req.url);
      ctx.path = url.pathname;
    } catch {
      // If URL parsing fails, leave path undefined
    }
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

  const method = errorContext.event?.req.method ?? '';
  let path: string | null = null;

  try {
    if (errorContext.event?.req.url) {
      path = new URL(errorContext.event.req.url).pathname;
    }
  } catch {
    // If URL parsing fails, leave path as null
  }

  if (path) {
    getCurrentScope().setTransactionName(`${method} ${path}`);
  }

  const structuredContext = extractErrorContext(errorContext);

  captureException(error, {
    captureContext: { contexts: { nitro: structuredContext } },
    mechanism: { handled: false, type: 'auto.function.nitro' },
  });

  await flushIfServerless();
}
