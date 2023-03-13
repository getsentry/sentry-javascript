import { captureException } from '@sentry/node';
import { addExceptionMechanism, objectify } from '@sentry/utils';
import type { HttpError, ServerLoad } from '@sveltejs/kit';

function isHttpError(err: unknown): err is HttpError {
  return typeof err === 'object' && err !== null && 'status' in err && 'body' in err;
}

/**
 * Wrap load function with Sentry
 *
 * @param origLoad SvelteKit user defined load function
 */
export function wrapLoadWithSentry(origLoad: ServerLoad): ServerLoad {
  return new Proxy(origLoad, {
    apply: async (wrappingTarget, thisArg, args: Parameters<ServerLoad>) => {
      try {
        return await wrappingTarget.apply(thisArg, args);
      } catch (e) {
        // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
        // store a seen flag on it.
        const objectifiedErr = objectify(e) as unknown;

        // The error() helper is commonly used to throw errors in load functions: https://kit.svelte.dev/docs/modules#sveltejs-kit-error
        // If we detect a thrown error that is an instance of HttpError, we don't want to capture 4xx errors as they
        // could be noisy.
        if (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400) {
          throw objectifiedErr;
        }

        captureException(objectifiedErr, scope => {
          scope.addEventProcessor(event => {
            addExceptionMechanism(event, {
              type: 'instrument',
              handled: false,
              data: {
                function: 'load',
              },
            });
            return event;
          });

          return scope;
        });

        throw objectifiedErr;
      }
    },
  });
}
