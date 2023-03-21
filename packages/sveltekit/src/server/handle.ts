/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type { Span } from '@sentry/core';
import { trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
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
    const sentryTraceHeader = event.request.headers.get('sentry-trace');
    const baggageHeader = event.request.headers.get('baggage');
    const traceparentData = sentryTraceHeader ? extractTraceparentData(sentryTraceHeader) : undefined;
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

    return trace(
      {
        op: 'http.server',
        name: `${event.request.method} ${event.route.id}`,
        status: 'ok',
        ...traceparentData,
        metadata: {
          source: 'route',
          dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
        },
      },
      async (span: Span) => {
        const res = await resolve(event);
        span.setHttpStatus(res.status);
        return res;
      },
      sendErrorToSentry,
    );
  })();
};
