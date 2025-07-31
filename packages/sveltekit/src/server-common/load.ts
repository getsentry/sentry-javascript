import {
  addNonEnumerableProperty,
  flushIfServerless,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
} from '@sentry/core';
import type { LoadEvent, ServerLoadEvent } from '@sveltejs/kit';
import type { SentryWrappedFlag } from '../common/utils';
import { sendErrorToSentry } from './utils';

type PatchedLoadEvent = LoadEvent & SentryWrappedFlag;
type PatchedServerLoadEvent = ServerLoadEvent & SentryWrappedFlag;

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

      const routeId = event.route?.id;

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
        sendErrorToSentry(e, 'load');
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
        sendErrorToSentry(e, 'load');
        throw e;
      } finally {
        await flushIfServerless();
      }
    },
  });
}
