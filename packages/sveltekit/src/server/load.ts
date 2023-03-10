import { captureException } from '@sentry/node';
import { addExceptionMechanism, objectify } from '@sentry/utils';
// eslint-disable-next-line import/no-unresolved
import type { ServerLoad } from '@sveltejs/kit';

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
        const objectifiedErr = objectify(e);

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
