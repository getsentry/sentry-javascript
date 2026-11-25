import { captureException, getClient, isAlreadyCaptured, parseUrl } from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import type { NitroCapturedErrorContext } from './nitroTypes';

interface H3HTTPError extends Error {
  status: number;
  cause?: unknown;
}

// Same check as h3's `HTTPError.isError`, so we don't depend on h3.
function isH3HTTPError(error: unknown): error is H3HTTPError {
  return error instanceof Error && error.name === 'HTTPError' && (error as H3HTTPError).status > 99;
}

function extractErrorContext(errorContext: NitroCapturedErrorContext | undefined): Record<string, unknown> {
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
 * Captures an error passed to Nitro's `error` hook and sends it to Sentry.
 */
export async function captureNitroRequestError(
  error: unknown,
  errorContext?: NitroCapturedErrorContext,
): Promise<void> {
  const sentryClientOptions = getClient()?.getOptions();

  if (
    sentryClientOptions &&
    'enableNitroErrorHandler' in sentryClientOptions &&
    sentryClientOptions.enableNitroErrorHandler === false
  ) {
    return;
  }

  // Do not report HTTPErrors with 3xx or 4xx status codes
  if (isH3HTTPError(error) && error.status >= 300 && error.status < 500) {
    return;
  }

  // Nitro wraps errors thrown in handlers in an `HTTPError`, so an error the SDK already captured (for example in a
  // task) would be reported a second time through the wrapper.
  if (isH3HTTPError(error) && isAlreadyCaptured(error.cause)) {
    return;
  }

  captureException(error, {
    captureContext: { contexts: { nitro: extractErrorContext(errorContext) } },
    mechanism: { handled: false, type: 'auto.function.nitro.captureErrorHook' },
  });

  await flushIfServerless();
}

/**
 * Captures an error thrown by a Nitro task and sends it to Sentry.
 */
export async function captureNitroTaskError(error: unknown, taskName: string): Promise<void> {
  captureException(error, {
    captureContext: { contexts: { nitro: { task: taskName } } },
    mechanism: { handled: false, type: 'auto.function.nitro.task' },
  });

  await flushIfServerless();
}
