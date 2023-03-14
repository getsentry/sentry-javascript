import { captureException } from '@sentry/svelte';
import { addExceptionMechanism, isThenable, objectify } from '@sentry/utils';
import type { ServerLoad } from '@sveltejs/kit';

function captureAndThrowError(e: unknown): void {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  captureException(objectifiedErr, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'sveltekit',
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

/**
 * Wrap load function with Sentry
 *
 * @param origLoad SvelteKit user defined load function
 */
export function wrapLoadWithSentry(origLoad: ServerLoad): ServerLoad {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<ServerLoad>) => {
      let maybePromiseResult;

      try {
        maybePromiseResult = wrappingTarget.apply(thisArg, args);
      } catch (e) {
        captureAndThrowError(e);
      }

      if (isThenable(maybePromiseResult)) {
        Promise.resolve(maybePromiseResult).then(null, e => {
          captureAndThrowError(e);
        });
      }

      return maybePromiseResult;
    },
  });
}
