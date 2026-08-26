import { captureException, consoleSandbox, flushIfServerless } from '@sentry/core';
import type { AnyErrorHandler, SentryHandleServerErrorInput } from '../common/handleErrorTypes';
import { shouldCaptureCaughtError } from '../common/handleErrorTypes';
import { getCloudflareExecutionContext } from './utils';

type ServerErrorHandler = (input: SentryHandleServerErrorInput) => unknown;

/**
 * The default shape of the wrapped hook: structurally compatible with SvelteKit's
 * `HandleServerError` on every supported major.
 */
type SentryHandleServerError = (input: SentryHandleServerErrorInput) => Promise<void | App.Error>;

// Mirrors SvelteKit's own default error handler, which differs by major version:
// - SvelteKit 1.x/2.x log the error's stack trace
// - SvelteKit 3 only logs unexpected errors (walking the `cause` chain), and logs the issues of
//   remote function validation errors
// see: https://github.com/sveltejs/kit/blob/version-3/packages/kit/src/runtime/server/index.js
function defaultErrorHandler({ kind, error, issues }: SentryHandleServerErrorInput): void {
  if (kind === 'validation') {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error('Remote function schema validation failed:', issues);
    });
    return;
  }

  if (kind && kind !== 'unknown') {
    // Don't log stack traces for expected app errors or framework errors like 404s
    return;
  }

  consoleSandbox(() => {
    if (!kind) {
      // SvelteKit 1.x/2.x
      // eslint-disable-next-line no-console
      console.error((error as Error | undefined)?.stack);
      return;
    }

    let e = error;
    while (e instanceof Error) {
      if (e.stack) {
        // eslint-disable-next-line no-console
        console.error(e.stack);
      }
      // `Error.cause` needs a lib newer than the one we compile against
      e = (e as Error & { cause?: unknown }).cause;
    }

    if (e) {
      // eslint-disable-next-line no-console
      console.error(String(e));
    }
  });
}

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry<T extends AnyErrorHandler = SentryHandleServerError>(handleError?: T): T {
  const errorHandler = (handleError ?? defaultErrorHandler) as ServerErrorHandler;

  const sentryErrorHandler = async (input: SentryHandleServerErrorInput): Promise<void | App.Error> => {
    if (!shouldSendToSentry(input)) {
      return errorHandler(input) as void | App.Error;
    }

    captureException(input.error, {
      mechanism: {
        type: 'auto.function.sveltekit.handle_error',
        handled: !!handleError,
      },
    });

    const cloudflareCtx = getCloudflareExecutionContext(input.event?.platform);

    // Cloudflare workers have a `waitUntil` method on `ctx` that we can use to flush the event queue
    // We already call this in `wrapRequestHandler` from `sentryHandleInitCloudflare`
    // However, `handleError` can be invoked when wrapRequestHandler already finished
    // (e.g. when responses are streamed / returning promises from load functions)
    if (typeof cloudflareCtx?.waitUntil === 'function') {
      await flushIfServerless({ cloudflareCtx });
    } else {
      await flushIfServerless();
    }

    return errorHandler(input) as void | App.Error;
  };

  return sentryErrorHandler as unknown as T;
}

function shouldSendToSentry(input: SentryHandleServerErrorInput): boolean {
  // SvelteKit 3 tells us where the error came from. Note that we must not touch `input.status`
  // in this case: it only exists as a deprecated getter in dev builds and logs a warning when read.
  const shouldCapture = shouldCaptureCaughtError(input);
  if (shouldCapture !== undefined) {
    return shouldCapture;
  }

  return !is4xxError(input);
}

/**
 * When a page request fails because the page is not found, SvelteKit throws a "Not found" error.
 *
 * Only relevant for SvelteKit 1.x and 2.x — see {@link shouldCaptureCaughtError} for SvelteKit 3.
 */
function is4xxError(input: SentryHandleServerErrorInput): boolean {
  const { error, event, status } = input;

  // SvelteKit 2.0 offers a reliable way to check for a Not Found error:
  if (!!status && status >= 400 && status < 500) {
    return true;
  }

  // SvelteKit 1.x doesn't offer a reliable way to check for a Not Found error.
  // So we check the route id (shouldn't exist) and the raw stack trace
  // We can delete all of this below whenever we drop Kit 1.x support
  const hasNoRouteId = !event?.route?.id;

  const rawStack: string =
    (error != null &&
      typeof error === 'object' &&
      'stack' in error &&
      typeof error.stack === 'string' &&
      error.stack) ||
    '';

  return hasNoRouteId && rawStack.startsWith('Error: Not found:');
}
