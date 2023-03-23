/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import { trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import type { DynamicSamplingContext, TraceparentData, TransactionContext } from '@sentry/types';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
  objectify,
} from '@sentry/utils';
import type { HttpError, Load, LoadEvent, ServerLoad, ServerLoadEvent } from '@sveltejs/kit';

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
export function wrapLoadWithSentry<T extends Load | ServerLoad>(origLoad: T): T {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<ServerLoad | Load>) => {
      const [event] = args;
      const routeId = event.route && event.route.id;

      const { traceparentData, dynamicSamplingContext } = getTracePropagationData(event);

      const traceLoadContext: TransactionContext = {
        op: 'function.sveltekit.load',
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

function getTracePropagationData(event: ServerLoadEvent | LoadEvent): {
  traceparentData?: TraceparentData;
  dynamicSamplingContext?: Partial<DynamicSamplingContext>;
} {
  if (!isServerOnlyLoad(event)) {
    return {};
  }

  const sentryTraceHeader = event.request.headers.get('sentry-trace');
  const baggageHeader = event.request.headers.get('baggage');
  const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
  const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

  return { traceparentData, dynamicSamplingContext };
}

/**
 * Our server-side wrapLoadWithSentry can be used to wrap two different kinds of `load` functions:
 *  - load functions from `+(page|layout).ts`: These can be called both on client and on server
 *  - load functions from `+(page|layout).server.ts`: These are only called on the server
 *
 * In both cases, load events look differently. We can distinguish them by checking if the
 * event has a `request` field (which only the server-exclusive load event has).
 */
function isServerOnlyLoad(event: ServerLoadEvent | LoadEvent): event is ServerLoadEvent {
  return 'request' in event;
}
