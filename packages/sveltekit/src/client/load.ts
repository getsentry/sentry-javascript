import { trace } from '@sentry/core';
import { captureException } from '@sentry/svelte';
import { addExceptionMechanism, objectify } from '@sentry/utils';
import type { Load } from '@sveltejs/kit';

function sendErrorToSentry(e: unknown): unknown {
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

  return objectifiedErr;
}

/**
 * Wrap load function with Sentry
 * TODO: usage
 *
 * @param origLoad SvelteKit user defined load function
 */
export function wrapLoadWithSentry<T extends Load>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      const [event] = args;

      const routeId = event.route.id;
      return trace(
        {
          op: 'function.sveltekit.load',
          name: routeId ? routeId : event.url.pathname,
          status: 'ok',
          metadata: {
            source: routeId ? 'route' : 'url',
          },
        },
        () => wrappingTarget.apply(thisArg, args),
        sendErrorToSentry,
      );
    },
  });
}
