/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import { captureException } from '@sentry/node';
import { addExceptionMechanism, isThenable, objectify } from '@sentry/utils';
import type { HttpError, Load, ServerLoad } from '@sveltejs/kit';
import * as domain from 'domain';

function isHttpError(err: unknown): err is HttpError {
  return typeof err === 'object' && err !== null && 'status' in err && 'body' in err;
}

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // The error() helper is commonly used to throw errors in load functions: https://kit.svelte.dev/docs/modules#sveltejs-kit-error
  // If we detect a thrown error that is an instance of HttpError, we don't want to capture 4xx errors as they
  // could be noisy.
  if (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400) {
    return objectifiedErr;
  }

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
export function wrapLoadWithSentry<T extends ServerLoad | Load>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<ServerLoad>) => {
      return domain.create().bind(() => {
        let maybePromiseResult: ReturnType<T>;

        try {
          maybePromiseResult = wrappingTarget.apply(thisArg, args);
        } catch (e) {
          sendErrorToSentry(e);
          throw e;
        }

        if (isThenable(maybePromiseResult)) {
          Promise.resolve(maybePromiseResult).then(null, e => {
            sendErrorToSentry(e);
          });
        }

        return maybePromiseResult;
      })();
    },
  });
}
