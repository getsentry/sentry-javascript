/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import { trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import type { TransactionContext } from '@sentry/types';
import { addExceptionMechanism, objectify } from '@sentry/utils';
import type { HttpError, LoadEvent, ServerLoadEvent } from '@sveltejs/kit';

import type { SentryWrappedFlag } from '../common/utils';
import { isRedirect } from '../common/utils';
import { getTracePropagationData } from './utils';

type PatchedLoadEvent = LoadEvent & SentryWrappedFlag;
type PatchedServerLoadEvent = ServerLoadEvent & SentryWrappedFlag;

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
  // Also the `redirect(...)` helper is used to redirect users from one page to another. We don't want to capture thrown
  // `Redirect`s as they're not errors but expected behaviour
  if (
    isRedirect(objectifiedErr) ||
    (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400)
  ) {
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
      // Also, this event possibly already has a sentry wrapped flag attached
      const event = args[0] as PatchedLoadEvent;

      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      const patchedEvent: PatchedLoadEvent = {
        ...event,
        __sentry_wrapped__: true,
      };

      const routeId = event.route && event.route.id;

      const traceLoadContext: TransactionContext = {
        op: 'function.sveltekit.load',
        name: routeId ? routeId : event.url.pathname,
        status: 'ok',
        metadata: {
          source: routeId ? 'route' : 'url',
        },
      };

      return trace(traceLoadContext, () => wrappingTarget.apply(thisArg, [patchedEvent]), sendErrorToSentry);
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
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      // Type casting here because `T` cannot extend `ServerLoad` (see comment above function signature)
      // Also, this event possibly already has a sentry wrapped flag attached
      const event = args[0] as PatchedServerLoadEvent;

      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      const patchedEvent: PatchedServerLoadEvent = {
        ...event,
        __sentry_wrapped__: true,
      };

      const routeId = event.route && event.route.id;

      const { dynamicSamplingContext, traceparentData } = getTracePropagationData(event);

      const traceLoadContext: TransactionContext = {
        op: 'function.sveltekit.server.load',
        name: routeId ? routeId : event.url.pathname,
        status: 'ok',
        metadata: {
          source: routeId ? 'route' : 'url',
          dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
        },
        data: {
          'http.method': event.request.method,
        },
        ...traceparentData,
      };

      return trace(traceLoadContext, () => wrappingTarget.apply(thisArg, [patchedEvent]), sendErrorToSentry);
    },
  });
}
