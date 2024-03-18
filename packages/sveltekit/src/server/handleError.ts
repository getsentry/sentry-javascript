import { captureException } from '@sentry/node';
import type { HandleServerError } from '@sveltejs/kit';

import { flushIfServerless } from './utils';

// The SvelteKit default error handler just logs the error's stack trace to the console
// see: https://github.com/sveltejs/kit/blob/369e7d6851f543a40c947e033bfc4a9506fdc0a8/packages/kit/src/runtime/server/index.js#L43
function defaultErrorHandler({ error }: Parameters<HandleServerError>[0]): ReturnType<HandleServerError> {
  // @ts-expect-error this conforms to the default implementation (including this ts-expect-error)
  // eslint-disable-next-line no-console
  console.error(error && error.stack);
}

type HandleServerErrorInput = Parameters<HandleServerError>[0];

/**
 * Backwards-compatible HandleServerError Input type for SvelteKit 1.x and 2.x
 * `message` and `status` were added in 2.x.
 * For backwards-compatibility, we make them optional
 *
 * @see https://kit.svelte.dev/docs/migrating-to-sveltekit-2#improved-error-handling
 */
type SafeHandleServerErrorInput = Omit<HandleServerErrorInput, 'status' | 'message'> &
  Partial<Pick<HandleServerErrorInput, 'status' | 'message'>>;

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry(handleError: HandleServerError = defaultErrorHandler): HandleServerError {
  return async (input: SafeHandleServerErrorInput): Promise<void | App.Error> => {
    if (isNotFoundError(input)) {
      // We're extra cautious with SafeHandleServerErrorInput - this type is not compatible with HandleServerErrorInput
      // @ts-expect-error - we're still passing the same object, just with a different (backwards-compatible) type
      return handleError(input);
    }

    captureException(input.error, {
      mechanism: {
        type: 'sveltekit',
        handled: false,
      },
    });

    await flushIfServerless();

    // We're extra cautious with SafeHandleServerErrorInput - this type is not compatible with HandleServerErrorInput
    // @ts-expect-error - we're still passing the same object, just with a different (backwards-compatible) type
    return handleError(input);
  };
}

/**
 * When a page request fails because the page is not found, SvelteKit throws a "Not found" error.
 */
function isNotFoundError(input: SafeHandleServerErrorInput): boolean {
  const { error, event, status } = input;

  // SvelteKit 2.0 offers a reliable way to check for a Not Found error:
  if (status === 404) {
    return true;
  }

  // SvelteKit 1.x doesn't offer a reliable way to check for a Not Found error.
  // So we check the route id (shouldn't exist) and the raw stack trace
  // We can delete all of this below whenever we drop Kit 1.x support
  const hasNoRouteId = !event.route || !event.route.id;

  const rawStack: string =
    (error != null &&
      typeof error === 'object' &&
      'stack' in error &&
      typeof error.stack === 'string' &&
      error.stack) ||
    '';

  return hasNoRouteId && rawStack.startsWith('Error: Not found:');
}
