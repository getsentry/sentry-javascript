/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type { Span } from '@sentry/core';
import { captureException, getCurrentHub } from '@sentry/node';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
  isThenable,
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

function setSpan(span: Span | undefined): void {
  getCurrentHub().getScope()?.setSpan(span);
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
        let maybePromiseResult;

        const [event] = args;
        const hub = getCurrentHub();
        const scope = hub.getScope();

        const parentSpan = scope?.getSpan();

        let activeSpan: Span | undefined = undefined;

        function finishActiveSpan(): void {
          activeSpan?.finish();
          setSpan(parentSpan);
        }

        if (parentSpan) {
          activeSpan = parentSpan.startChild({
            op: 'function.sveltekit.load',
            description: event.route.id || 'load',
            status: 'ok',
          });
        } else {
          const sentryTraceHeader = event.request.headers.get('sentry-trace');
          const baggageHeader = event.request.headers.get('baggage');
          const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
          const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

          activeSpan = hub.startTransaction({
            op: 'function.sveltekit.load',
            name: event.route.id || 'load',
            status: 'ok',
            ...traceparentData,
            metadata: {
              source: 'route',
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            },
          });
        }

        setSpan(activeSpan);

        try {
          maybePromiseResult = wrappingTarget.apply(thisArg, args);
        } catch (e) {
          activeSpan?.setStatus('internal_error');
          const sentryError = sendErrorToSentry(e);
          finishActiveSpan();
          throw sentryError;
        }

        if (isThenable(maybePromiseResult)) {
          Promise.resolve(maybePromiseResult).then(
            () => {
              finishActiveSpan();
            },
            e => {
              activeSpan?.setStatus('internal_error');
              sendErrorToSentry(e);
              finishActiveSpan();
            },
          );
        } else {
          finishActiveSpan();
        }

        return maybePromiseResult;
      })();
    },
  });
}
