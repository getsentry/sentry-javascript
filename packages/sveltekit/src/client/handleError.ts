import { isObjectLike, consoleSandbox } from '@sentry/core';
import { captureException } from '@sentry/svelte';
import type { AnyErrorHandler, SentryHandleClientErrorInput } from '../common/handleErrorTypes';
import { shouldCaptureCaughtError } from '../common/handleErrorTypes';

type ClientErrorHandler = (input: SentryHandleClientErrorInput) => unknown;

/**
 * The default shape of the wrapped hook: structurally compatible with SvelteKit's
 * `HandleClientError` on every supported major.
 */
type SentryHandleClientError = (input: SentryHandleClientErrorInput) => void | App.Error;

// Mirrors SvelteKit's own default client error handler, which differs by major version:
// - SvelteKit 1.x/2.x log every error
// - SvelteKit 3 only logs unexpected errors
// see: https://github.com/sveltejs/kit/blob/version-3/packages/kit/src/core/sync/write_client_manifest.js
function defaultErrorHandler({ kind, error }: SentryHandleClientErrorInput): void {
  if (kind && kind !== 'unknown') {
    return;
  }

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
}

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry<T extends AnyErrorHandler = SentryHandleClientError>(handleError?: T): T {
  const errorHandler = (handleError ?? defaultErrorHandler) as ClientErrorHandler;

  const sentryErrorHandler = (input: SentryHandleClientErrorInput): void | App.Error => {
    if (!shouldSendToSentry(input)) {
      return errorHandler(input) as void | App.Error;
    }

    captureException(input.error, {
      mechanism: {
        type: 'auto.function.sveltekit.handle_error',
        handled: !!handleError,
      },
    });

    return errorHandler(input) as void | App.Error;
  };

  return sentryErrorHandler as unknown as T;
}

function shouldSendToSentry(input: SentryHandleClientErrorInput): boolean {
  // SvelteKit 3 tells us where the error came from. Note that we must not touch `input.status`
  // in this case: it only exists as a deprecated getter in dev builds and logs a warning when read.
  const shouldCapture = shouldCaptureCaughtError(input);
  if (shouldCapture !== undefined) {
    return shouldCapture;
  }

  return !is4xxError(input);
}

// 4xx are expected errors and thus we don't want to capture them
// Only relevant for SvelteKit 1.x and 2.x — see `shouldCaptureCaughtError` for SvelteKit 3.
function is4xxError(input: SentryHandleClientErrorInput): boolean {
  const { status } = input;

  if (status && status >= 400 && status < 500) {
    return true;
  }

  // SvelteKit __data.json requests return HTTP 200 with errors embedded in JSON,
  // so get_status() may resolve to 500 for a deserialized plain error object.
  // Fall back to checking input.error.status directly.
  const errorStatus = isObjectLike(input.error) ? (input.error as Record<string, unknown>)['status'] : undefined;

  return typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500;
}
