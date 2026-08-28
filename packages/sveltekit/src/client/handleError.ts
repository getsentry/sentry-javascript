import { consoleSandbox } from '@sentry/core';
import { captureException } from '@sentry/svelte';
import type { AnyErrorHandler, SentryHandleClientErrorInput } from '../common/handleErrorTypes';
import { getErrorStatus, shouldCaptureError } from '../common/handleErrorTypes';

type ClientErrorHandler = (input: SentryHandleClientErrorInput) => unknown;

/**
 * The default shape of the wrapped hook: structurally compatible with SvelteKit's
 * `HandleClientError` on every supported major.
 */
type SentryHandleClientError = (input: SentryHandleClientErrorInput) => void | App.Error;

// Mirrors SvelteKit's own default client error handler, which differs by major version:
// - SvelteKit 1.x/2.x log every error
// - SvelteKit 3 only logs unexpected errors
// see: https://github.com/sveltejs/kit/blob/49f0808f3e983d0cb5a4d586cf0d1678467431ed/packages/kit/src/core/sync/write_client_manifest.js#L157-L160
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

  const sentryErrorHandler = (input: SentryHandleClientErrorInput): unknown => {
    if (!shouldCaptureError(input, () => isExpectedLegacyError(input))) {
      return errorHandler(input);
    }

    captureException(input.error, {
      mechanism: {
        type: 'auto.function.sveltekit.handle_error',
        handled: !!handleError,
      },
    });

    return errorHandler(input);
  };

  // Returning `T` (the caller's own hook type) is what keeps the result assignable to
  // `HandleClientError` on both SvelteKit 2 and 3. The wrapper itself is written against our
  // structural input type, which TS can't prove is identical to `T`, so it can't be narrowed
  // without the double cast.
  return sentryErrorHandler as unknown as T;
}

/**
 * Whether a SvelteKit 1.x/2.x error is an expected 4xx we don't want to capture.
 *
 * SvelteKit 3 errors are classified by `shouldCaptureError` instead.
 */
function isExpectedLegacyError(input: SentryHandleClientErrorInput): boolean {
  if (input.kind) {
    // Not a SvelteKit 1.x/2.x input - narrows the union so `status` below is readable
    return false;
  }

  const { status } = input;

  if (status && status >= 400 && status < 500) {
    return true;
  }

  // SvelteKit __data.json requests return HTTP 200 with errors embedded in JSON,
  // so get_status() may resolve to 500 for a deserialized plain error object.
  // Fall back to checking input.error.status directly.
  const errorStatus = getErrorStatus(input.error);

  return errorStatus !== undefined && errorStatus >= 400 && errorStatus < 500;
}
