import type { Span } from '@sentry/core';
import { captureException, getCurrentHub } from '@sentry/svelte';
import { addExceptionMechanism, isThenable, objectify } from '@sentry/utils';
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
 *
 * @param origLoad SvelteKit user defined load function
 */
export function wrapLoadWithSentry(origLoad: Load): Load {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<Load>) => {
      let maybePromiseResult;

      const [event] = args;

      const scope = getCurrentHub().getScope();

      let activeSpan: Span | undefined = undefined;
      let parentSpan: Span | undefined = undefined;

      if (scope) {
        parentSpan = scope.getSpan();
        if (parentSpan) {
          activeSpan = parentSpan.startChild({
            op: 'function.sveltekit.load',
            description: event.route.id || '/',
          });

          scope.setSpan(activeSpan);
        }
      }

      try {
        maybePromiseResult = wrappingTarget.apply(thisArg, args);
      } catch (e) {
        if (activeSpan) {
          activeSpan.setStatus('internal_error');
          activeSpan.finish();
        }
        const sentryError = sendErrorToSentry(e);
        throw sentryError;
      }

      if (isThenable(maybePromiseResult)) {
        Promise.resolve(maybePromiseResult).then(
          () => {
            if (activeSpan) {
              activeSpan.finish();
            }
          },
          e => {
            if (activeSpan) {
              activeSpan.setStatus('internal_error');
              activeSpan.finish();
            }
            sendErrorToSentry(e);
          },
        );
      } else {
        if (activeSpan) {
          activeSpan.finish();
        }
      }

      return maybePromiseResult;
    },
  });
}
