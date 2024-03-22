import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  startSpan,
} from '@sentry/node';
import { addNonEnumerableProperty, objectify } from '@sentry/utils';
import type { LoadEvent, ServerLoadEvent } from '@sveltejs/kit';

import type { SentryWrappedFlag } from '../common/utils';
import { isHttpError, isRedirect } from '../common/utils';
import { flushIfServerless } from './utils';

type PatchedLoadEvent = LoadEvent & SentryWrappedFlag;
type PatchedServerLoadEvent = ServerLoadEvent & SentryWrappedFlag;

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // The error() helper is commonly used to throw errors in load functions: https://kit.svelte.dev/docs/modules#sveltejs-kit-error
  // If we detect a thrown error that is an instance of HttpError, we don't want to capture 4xx errors as they
  // could be noisy.
  // Also the `redirect(...)` helper is used to redirect users from one page to another. We don't want to capture thrown
  // `Redirect`s as they're not errors but expected behaviour
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
 * @inheritdoc
 */
// The liberal generic typing of `T` is necessary because we cannot let T extend `Load`.
// This function needs to tell TS that it returns exactly the type that it was called with
// because SvelteKit generates the narrowed down `PageLoad` or `LayoutLoad` types
// at build time for every route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapLoadWithSentry<T extends (...args: any) => any>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: async (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `Load` (see comment above function signature)
      // Also, this event possibly already has a sentry wrapped flag attached
      const event = args[0] as PatchedLoadEvent;

      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      addNonEnumerableProperty(event as unknown as Record<string, unknown>, '__sentry_wrapped__', true);

      const routeId = event.route && event.route.id;

      try {
        // We need to await before returning, otherwise we won't catch any errors thrown by the load function
        return await startSpan(
          {
            op: 'function.sveltekit.load',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeId ? 'route' : 'url',
            },
            name: routeId ? routeId : event.url.pathname,
          },
          () => wrappingTarget.apply(thisArg, args),
        );
      } catch (e) {
        sendErrorToSentry(e);
        throw e;
      } finally {
        await flushIfServerless();
      }
    },
  });
}

/**
 * Wrap a server-only load function (e.g. +page.server.js or +layout.server.js) with Sentry functionality
 *
 * Usage:
 *
 * ```js
 * // +page.serverjs
 *
 * import { wrapServerLoadWithSentry }
 *
 * export const load = wrapServerLoadWithSentry((event) => {
 *   // your load code
 * });
 * ```
 *
 * @param origServerLoad SvelteKit user defined server-only load function
 */
// The liberal generic typing of `T` is necessary because we cannot let T extend `ServerLoad`.
// This function needs to tell TS that it returns exactly the type that it was called with
// because SvelteKit generates the narrowed down `PageServerLoad` or `LayoutServerLoad` types
// at build time for every route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerLoadWithSentry<T extends (...args: any) => any>(origServerLoad: T): T {
  return new Proxy(origServerLoad, {
    apply: async (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `ServerLoad` (see comment above function signature)
      // Also, this event possibly already has a sentry wrapped flag attached
      const event = args[0] as PatchedServerLoadEvent;

      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      addNonEnumerableProperty(event as unknown as Record<string, unknown>, '__sentry_wrapped__', true);

      // Accessing any member of `event.route` causes SvelteKit to invalidate the
      // server `load` function's data on every route change.
      // To work around this, we use `Object.getOwnPropertyDescriptor` which doesn't invoke the proxy.
      // https://github.com/sveltejs/kit/blob/e133aba479fa9ba0e7f9e71512f5f937f0247e2c/packages/kit/src/runtime/server/page/load_data.js#L111C3-L124
      const routeId = event.route && (Object.getOwnPropertyDescriptor(event.route, 'id')?.value as string | undefined);

      try {
        // We need to await before returning, otherwise we won't catch any errors thrown by the load function
        return await startSpan(
          {
            op: 'function.sveltekit.server.load',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeId ? 'route' : 'url',
              'http.method': event.request.method,
            },
            name: routeId ? routeId : event.url.pathname,
          },
          () => wrappingTarget.apply(thisArg, args),
        );
      } catch (e: unknown) {
        sendErrorToSentry(e);
        throw e;
      } finally {
        await flushIfServerless();
      }
    },
  });
}
