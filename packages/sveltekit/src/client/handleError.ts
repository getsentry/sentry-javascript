import { captureException } from '@sentry/svelte';
import { addExceptionMechanism } from '@sentry/utils';
// For now disable the import/no-unresolved rule, because we don't have a way to
// tell eslint that we are only importing types from the @sveltejs/kit package without
// adding a custom resolver, which will take too much time.
// eslint-disable-next-line import/no-unresolved
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function wrapHandleError(handleError: HandleClientError): HandleClientError {
  return (input: { error: unknown; event: NavigationEvent }): ReturnType<HandleClientError> => {
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
