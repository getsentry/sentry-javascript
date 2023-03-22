/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import { trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
  objectify,
} from '@sentry/utils';
import type { HttpError, ServerLoad } from '@sveltejs/kit';
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
export function wrapLoadWithSentry(origLoad: ServerLoad): ServerLoad {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<ServerLoad>) => {
      return domain.create().bind(() => {
        const [event] = args;

        const sentryTraceHeader = event.request.headers.get('sentry-trace');
        const baggageHeader = event.request.headers.get('baggage');
        const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
        const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

        const routeId = event.route.id;
        return trace(
          {
            op: 'function.sveltekit.load',
            name: routeId ? routeId : event.url.pathname,
            status: 'ok',
            ...traceparentData,
            metadata: {
              source: routeId ? 'route' : 'url',
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            },
          },
          () => wrappingTarget.apply(thisArg, args),
          sendErrorToSentry,
        );
      })();
    },
  });
}
