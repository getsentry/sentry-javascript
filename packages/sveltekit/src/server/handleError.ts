import { captureException } from '@sentry/node';
import { addExceptionMechanism } from '@sentry/utils';
// For now disable the import/no-unresolved rule, because we don't have a way to
// tell eslint that we are only importing types from the @sveltejs/kit package without
// adding a custom resolver, which will take too much time.
// eslint-disable-next-line import/no-unresolved
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';

// The SvelteKit default error handler just logs the error's stack trace to the console
// see: https://github.com/sveltejs/kit/blob/369e7d6851f543a40c947e033bfc4a9506fdc0a8/packages/kit/src/runtime/server/index.js#L43
function defaultErrorHandler({ error }: Parameters<HandleServerError>[0]): ReturnType<HandleServerError> {
  // @ts-expect-error this conforms to the default implementation (including this ts-expect-error)
  // eslint-disable-next-line no-console
  console.error(error && error.stack);
}

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry(handleError: HandleServerError = defaultErrorHandler): HandleServerError {
  return (input: { error: unknown; event: RequestEvent }): ReturnType<HandleServerError> => {
    if (isNotFoundError(input)) {
      return handleError(input);
    }

    captureException(input.error, scope => {
      scope.addEventProcessor(event => {
        addExceptionMechanism(event, {
          type: 'sveltekit',
          handled: false,
        });
        return event;
      });
      return scope;
    });

    return handleError(input);
  };
}

/**
 * When a page request fails because the page is not found, SvelteKit throws a "Not found" error.
 * In the error handler here, we can't access the response yet (which we do in the load instrumentation),
 * so we have to check if the error is a "Not found" error by checking if the route id is missing and
 * by checking the error message on top of the raw stack trace.
 */
function isNotFoundError(input: { error: unknown; event: RequestEvent }): boolean {
  const { error, event } = input;

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
