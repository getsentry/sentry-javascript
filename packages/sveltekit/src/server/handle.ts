/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import { captureException, getCurrentHub, startTransaction } from '@sentry/node';
import type { Transaction } from '@sentry/types';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
  isThenable,
  objectify,
} from '@sentry/utils';
import type { Handle } from '@sveltejs/kit';
import * as domain from 'domain';

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  captureException(objectifiedErr, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'sveltekit',
        handled: false,
        data: {
          function: 'handle',
        },
      });
      return event;
    });

    return scope;
  });

  return objectifiedErr;
}

/**
 * A SvelteKit handle function that wraps the request for Sentry error and
 * performance monitoring.
 *
 * Usage:
 * ```
 * // src/hooks.server.ts
 * import { sentryHandle } from '@sentry/sveltekit';
 *
 * export const handle = sentryHandle;
 *
 * // Optionally use the sequence function to add additional handlers.
 * // export const handle = sequence(sentryHandle, yourCustomHandle);
 * ```
 */
export const sentryHandle: Handle = ({ event, resolve }) => {
  return domain.create().bind(() => {
    let maybePromiseResult;

    const sentryTraceHeader = event.request.headers.get('sentry-trace');
    const baggageHeader = event.request.headers.get('baggage');
    const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

    // transaction could be undefined if hub extensions were not added.
    const transaction: Transaction | undefined = startTransaction({
      op: 'http.server',
      name: `${event.request.method} ${event.route.id}`,
      status: 'ok',
      ...traceparentData,
      metadata: {
        source: 'route',
        dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
      },
    });

    getCurrentHub().getScope()?.setSpan(transaction);

    try {
      maybePromiseResult = resolve(event);
    } catch (e) {
      transaction?.setStatus('internal_error');
      const sentryError = sendErrorToSentry(e);
      transaction?.finish();
      throw sentryError;
    }

    if (isThenable(maybePromiseResult)) {
      Promise.resolve(maybePromiseResult).then(
        response => {
          transaction?.setHttpStatus(response.status);
          transaction?.finish();
        },
        e => {
          transaction?.setStatus('internal_error');
          sendErrorToSentry(e);
          transaction?.finish();
        },
      );
    } else {
      transaction?.setHttpStatus(maybePromiseResult.status);
      transaction?.finish();
    }

    return maybePromiseResult;
  })();
};
