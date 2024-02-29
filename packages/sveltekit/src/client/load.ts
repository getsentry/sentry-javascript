import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  handleCallbackErrors,
  startSpan,
} from '@sentry/core';
import { captureException } from '@sentry/svelte';
import { addNonEnumerableProperty, objectify } from '@sentry/utils';
import type { LoadEvent } from '@sveltejs/kit';

import type { SentryWrappedFlag } from '../common/utils';
import { isHttpError, isRedirect } from '../common/utils';

type PatchedLoadEvent = LoadEvent & Partial<SentryWrappedFlag>;

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // We don't want to capture thrown `Redirect`s as these are not errors but expected behaviour
  // Neither 4xx errors, given that they are not valuable.
  if (
    isRedirect(objectifiedErr) ||
    (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400)
  ) {
    return objectifiedErr;
  }

  captureException(objectifiedErr, {
    mechanism: {
      type: 'sveltekit',
      handled: false,
      data: {
        function: 'load',
      },
    },
  });

  return objectifiedErr;
}

/**
 * Wrap load function with Sentry. This wrapper will
 *
 * - catch errors happening during the execution of `load`
 * - create a load span if performance monitoring is enabled
 * - attach tracing Http headers to `fech` requests if performance monitoring is enabled to get connected traces.
 * - add a fetch breadcrumb for every `fetch` request
 *
 * Note that tracing Http headers are only attached if the url matches the specified `tracePropagationTargets`
 * entries to avoid CORS errors.
 *
 * @param origLoad SvelteKit user defined load function
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
      const event = args[0] as PatchedLoadEvent;

      // Check if already wrapped
      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      const patchedEvent: PatchedLoadEvent = {
        ...event,
      };

      addNonEnumerableProperty(patchedEvent as unknown as Record<string, unknown>, '__sentry_wrapped__', true);

      // Accessing any member of `event.route` causes SvelteKit to invalidate the
      // client-side universal `load` function's data prefetched data, causing another reload on the actual navigation.
      // To work around this, we use `Object.getOwnPropertyDescriptor` which doesn't invoke the proxy.
      const routeIdDescriptor = event.route && Object.getOwnPropertyDescriptor(event.route, 'id');
      // First, we try to access the route id from the property descriptor.
      // This will only work for @sveltejs/kit >= 1.24.0
      const routeIdFromDescriptor = routeIdDescriptor && (routeIdDescriptor.value as string | undefined);
      // If routeIdFromDescriptor is undefined, we fall back to the old behavior of accessing
      // `event.route.id` directly. This will still cause invalidations but we get a route name.
      const routeId = routeIdFromDescriptor || event.route.id;

      return startSpan(
        {
          op: 'function.sveltekit.load',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeId ? 'route' : 'url',
          },
          name: routeId ? routeId : event.url.pathname,
        },
        () => handleCallbackErrors(() => wrappingTarget.apply(thisArg, [patchedEvent]), sendErrorToSentry),
      );
    },
  });
}
