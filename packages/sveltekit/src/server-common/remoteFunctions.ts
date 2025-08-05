import { addNonEnumerableProperty, captureException, flushIfServerless, startSpan } from '@sentry/core';
import type { LoadEvent } from '@sveltejs/kit';
import type { SentryWrappedFlag } from '../common/utils';

type PatchedRequestEvent = LoadEvent & SentryWrappedFlag;

/**
 * Wraps a remote function invokation with a Sentry span and captures an exception if the remote function throws.
 */
export function wrapRemoteFunctionWithSentry<T extends (...args: any) => any>(origRemoteFn: T): T {
  return new Proxy(origRemoteFn, {
    apply: async (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `Load` (see comment above function signature)
      // Also, this event possibly already has a sentry wrapped flag attached
      const event = args[0] as PatchedRequestEvent;

      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      addNonEnumerableProperty(event as unknown as Record<string, unknown>, '__sentry_wrapped__', true);

      const routeId = event.route?.id;

      try {
        // We need to await before returning, otherwise we won't catch any errors thrown by the load function
        return await startSpan(
          {
            name: routeId ? routeId : event.url.pathname,
          },
          () => wrappingTarget.apply(thisArg, args),
        );
      } catch (e) {
        captureException(e);
        throw e;
      } finally {
        await flushIfServerless();
      }
    },
  });
}
