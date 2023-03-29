/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import { trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import type { TransactionContext } from '@sentry/types';
import { addExceptionMechanism, objectify } from '@sentry/utils';
import type { HttpError, Load, ServerLoad } from '@sveltejs/kit';

import { getTracePropagationData } from './utils';

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
 * Wrap a universal load function (e.g. +page.js or +layout.js) with Sentry functionality
 *
 * Usage:
 * ```js
 * import {  }
 * ```
 *
 * @param origLoad SvelteKit user defined load function
 */
export function wrapLoadWithSentry<T extends Load>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      const [event] = args;
      const routeId = event.route && event.route.id;

      const traceLoadContext: TransactionContext = {
        op: 'function.sveltekit.load',
        name: routeId ? routeId : event.url.pathname,
        status: 'ok',
        metadata: {
          source: routeId ? 'route' : 'url',
        },
      };

      return trace(traceLoadContext, () => wrappingTarget.apply(thisArg, args), sendErrorToSentry);
    },
  });
}

/**
 * Wrap a server-only load function (e.g. +page.server.js or +layout.server.js) with Sentry functionality
 * TODO: usage
 *
 * @param origServerLoad SvelteKit user defined server-only load function
 */
export function wrapServerLoadWithSentry<T extends ServerLoad>(origServerLoad: T): T {
  return new Proxy(origServerLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<T>) => {
      const [event] = args;
      const routeId = event.route && event.route.id;

      // Usually, the `handleWithSentry` hook handler should already create a transaction and store
      // traceparent and DSC on that transaction before the server-only load function is called.
      // However, since we have access to `event.request` we can still pass it to `trace`
      // in case our handler isn't called or for some reason the handle hook is bypassed.
      const { dynamicSamplingContext, traceparentData } = getTracePropagationData(event);

      const traceLoadContext: TransactionContext = {
        op: 'function.sveltekit.server.load',
        name: routeId ? routeId : event.url.pathname,
        status: 'ok',
        metadata: {
          source: routeId ? 'route' : 'url',
          dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
        },
        ...traceparentData,
      };

      return trace(traceLoadContext, () => wrappingTarget.apply(thisArg, args), sendErrorToSentry);
    },
  });
}
