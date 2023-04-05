import { trace } from '@sentry/core';
import { captureException } from '@sentry/svelte';
import { addExceptionMechanism, objectify } from '@sentry/utils';
import type { LoadEvent } from '@sveltejs/kit';

import { isRedirect } from '../common/utils';

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // We don't want to capture thrown `Redirect`s as these are not errors but expected behaviour
  if (isRedirect(objectifiedErr)) {
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
 * @inheritdoc
 */
// The liberal generic typing of `T` is necessary because we cannot let T extend `Load`.
// This function needs to tell TS that it returns exactly the type that it was called with
// because SvelteKit generates the narrowed down `PageLoad` or `LayoutLoad` types
// at build time for every route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapLoadWithSentry<T extends (...args: any) => any>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `Load` (see comment above function signature)
      const event = args[0] as LoadEvent;

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
