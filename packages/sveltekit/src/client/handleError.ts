import { consoleSandbox } from '@sentry/core';
import { captureException } from '@sentry/svelte';
import type { HandleClientError } from '@sveltejs/kit';

// The SvelteKit default error handler just logs the error to the console
// see: https://github.com/sveltejs/kit/blob/369e7d6851f543a40c947e033bfc4a9506fdc0a8/packages/kit/src/core/sync/write_client_manifest.js#LL127C2-L127C2
function defaultErrorHandler({ error }: Parameters<HandleClientError>[0]): ReturnType<HandleClientError> {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
}

type HandleClientErrorInput = Parameters<HandleClientError>[0];

/**
 * Backwards-compatible HandleServerError Input type for SvelteKit 1.x and 2.x
 * `message` and `status` were added in 2.x.
 * For backwards-compatibility, we make them optional
 *
 * @see https://kit.svelte.dev/docs/migrating-to-sveltekit-2#improved-error-handling
 */
type SafeHandleServerErrorInput = Omit<HandleClientErrorInput, 'status' | 'message'> &
  Partial<Pick<HandleClientErrorInput, 'status' | 'message'>>;

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry(handleError?: HandleClientError): HandleClientError {
  const errorHandler = handleError ?? defaultErrorHandler;

  return (input: HandleClientErrorInput): ReturnType<HandleClientError> => {
    if (is4xxError(input)) {
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
}

// 4xx are expected errors and thus we don't want to capture them
function is4xxError(input: SafeHandleServerErrorInput): boolean {
  const { status } = input;

  if (status && status >= 400 && status < 500) {
    return true;
  }

  // SvelteKit __data.json requests return HTTP 200 with errors embedded in JSON,
  // so get_status() may resolve to 500 for a deserialized plain error object.
  // Fall back to checking input.error.status directly.
  const errorStatus =
    typeof input.error === 'object' && input.error !== null
      ? (input.error as Record<string, unknown>)['status']
      : undefined;

  return typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500;
}
