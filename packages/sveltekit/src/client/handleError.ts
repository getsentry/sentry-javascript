import { captureException } from '@sentry/svelte';
import { addExceptionMechanism } from '@sentry/utils';
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
