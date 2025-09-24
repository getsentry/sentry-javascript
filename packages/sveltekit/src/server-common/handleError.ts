import { captureException, consoleSandbox, flushIfServerless } from '@sentry/core';
import type { HandleServerError } from '@sveltejs/kit';

// The SvelteKit default error handler just logs the error's stack trace to the console
// see: https://github.com/sveltejs/kit/blob/369e7d6851f543a40c947e033bfc4a9506fdc0a8/packages/kit/src/runtime/server/index.js#L43
function defaultErrorHandler({ error }: Parameters<HandleServerError>[0]): ReturnType<HandleServerError> {
  // @ts-expect-error this conforms to the default implementation (including this ts-expect-error)
  // eslint-disable-next-line no-console
  consoleSandbox(() => console.error(error?.stack));
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
export function handleErrorWithSentry(handleError?: HandleServerError): HandleServerError {
  const errorHandler = handleError ?? defaultErrorHandler;

  return async (input: HandleServerErrorInput): Promise<void | App.Error> => {
    if (is4xxError(input)) {
      return errorHandler(input);
    }

    captureException(input.error, {
      mechanism: {
        type: 'auto.function.sveltekit.handle_error',
        handled: !!handleError,
      },
    });

    const platform = input.event.platform as {
      context?: {
        waitUntil?: (p: Promise<void>) => void;
      };
    };

    // Cloudflare workers have a `waitUntil` method on `ctx` that we can use to flush the event queue
    // We already call this in `wrapRequestHandler` from `sentryHandleInitCloudflare`
    // However, `handleError` can be invoked when wrapRequestHandler already finished
    // (e.g. when responses are streamed / returning promises from load functions)
    if (typeof platform?.context?.waitUntil === 'function') {
      await flushIfServerless({ cloudflareCtx: platform.context as { waitUntil(promise: Promise<void>): void } });
    } else {
      await flushIfServerless();
    }

    return errorHandler(input);
  };
}

/**
 * When a page request fails because the page is not found, SvelteKit throws a "Not found" error.
 */
function is4xxError(input: SafeHandleServerErrorInput): boolean {
  const { error, event, status } = input;

  // SvelteKit 2.0 offers a reliable way to check for a Not Found error:
  if (!!status && status >= 400 && status < 500) {
    return true;
  }

  // SvelteKit 1.x doesn't offer a reliable way to check for a Not Found error.
  // So we check the route id (shouldn't exist) and the raw stack trace
  // We can delete all of this below whenever we drop Kit 1.x support
  const hasNoRouteId = !event.route?.id;

  const rawStack: string =
    (error != null &&
      typeof error === 'object' &&
      'stack' in error &&
      typeof error.stack === 'string' &&
      error.stack) ||
    '';

  return hasNoRouteId && rawStack.startsWith('Error: Not found:');
}
