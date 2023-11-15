import { captureException } from '@sentry/svelte';
// For now disable the import/no-unresolved rule, because we don't have a way to
// tell eslint that we are only importing types from the @sveltejs/kit package without
// adding a custom resolver, which will take too much time.
// eslint-disable-next-line import/no-unresolved
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';

// The SvelteKit default error handler just logs the error to the console
// see: https://github.com/sveltejs/kit/blob/369e7d6851f543a40c947e033bfc4a9506fdc0a8/packages/kit/src/core/sync/write_client_manifest.js#LL127C2-L127C2
function defaultErrorHandler({ error }: Parameters<HandleClientError>[0]): ReturnType<HandleClientError> {
  // eslint-disable-next-line no-console
  console.error(error);
}

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry(handleError: HandleClientError = defaultErrorHandler): HandleClientError {
  return (input: { error: unknown; event: NavigationEvent }): ReturnType<HandleClientError> => {
    captureException(input.error, {
      mechanism: {
        type: 'sveltekit',
        handled: false,
      },
    });

    return handleError(input);
  };
}
