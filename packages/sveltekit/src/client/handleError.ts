import { captureException } from '@sentry/svelte';
import { consoleSandbox } from '@sentry/utils';
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
export function handleErrorWithSentry(handleError: HandleClientError = defaultErrorHandler): HandleClientError {
  return (input: SafeHandleServerErrorInput): ReturnType<HandleClientError> => {
    // SvelteKit 2.0 offers a reliable way to check for a 404 error:
    if (input.status !== 404) {
      captureException(input.error, {
        mechanism: {
          type: 'sveltekit',
          handled: false,
        },
      });
    }

    // We're extra cautious with SafeHandleServerErrorInput - this type is not compatible with HandleServerErrorInput
    // @ts-expect-error - we're still passing the same object, just with a different (backwards-compatible) type
    return handleError(input);
  };
}
