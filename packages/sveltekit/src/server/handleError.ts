import { captureException } from '@sentry/node';
import { addExceptionMechanism } from '@sentry/utils';
// For now disable the import/no-unresolved rule, because we don't have a way to
// tell eslint that we are only importing types from the @sveltejs/kit package without
// adding a custom resolver, which will take too much time.
// eslint-disable-next-line import/no-unresolved
import type { HandleServerError, RequestEvent } from '@sveltejs/kit';

/**
 * Wrapper for the SvelteKit error handler that sends the error to Sentry.
 *
 * @param handleError The original SvelteKit error handler.
 */
export function handleErrorWithSentry(handleError?: HandleServerError): HandleServerError {
  return (input: { error: unknown; event: RequestEvent }): ReturnType<HandleServerError> => {
    captureException(input.error, scope => {
      scope.addEventProcessor(event => {
        addExceptionMechanism(event, {
          type: 'instrument',
          handled: false,
        });
        return event;
      });
      return scope;
    });
    if (handleError) {
      return handleError(input);
    }
  };
}
