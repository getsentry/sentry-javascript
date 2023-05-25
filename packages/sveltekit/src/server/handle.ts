/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type { Span } from '@sentry/core';
import { getActiveTransaction, getCurrentHub, runWithAsyncContext, trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import { addExceptionMechanism, dynamicSamplingContextToSentryBaggageHeader, objectify } from '@sentry/utils';
import type { Handle, ResolveOptions } from '@sveltejs/kit';

import { isHttpError, isRedirect } from '../common/utils';
import { getTracePropagationData } from './utils';

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // similarly to the `load` function, we don't want to capture 4xx errors or redirects
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
          function: 'handle',
        },
      });
      return event;
    });

    return scope;
  });

  return objectifiedErr;
}

export const transformPageChunk: NonNullable<ResolveOptions['transformPageChunk']> = ({ html }) => {
  const transaction = getActiveTransaction();
  if (transaction) {
    const traceparentData = transaction.toTraceparent();
    const dynamicSamplingContext = dynamicSamplingContextToSentryBaggageHeader(transaction.getDynamicSamplingContext());
    const content = `<head>
      <meta name="sentry-trace" content="${traceparentData}"/>
      <meta name="baggage" content="${dynamicSamplingContext}"/>`;
    return html.replace('<head>', content);
  }

  return html;
};

/**
 * A SvelteKit handle function that wraps the request for Sentry error and
 * performance monitoring.
 *
 * Usage:
 * ```
 * // src/hooks.server.ts
 * import { sentryHandle } from '@sentry/sveltekit';
 *
 * export const handle = sentryHandle();
 *
 * // Optionally use the sequence function to add additional handlers.
 * // export const handle = sequence(sentryHandle(), yourCustomHandler);
 * ```
 */
export function sentryHandle(): Handle {
  return sentryRequestHandler;
}

const sentryRequestHandler: Handle = input => {
  // if there is an active transaction, we know that this handle call is nested and hence
  // we don't create a new domain for it. If we created one, nested server calls would
  // create new transactions instead of adding a child span to the currently active span.
  if (getCurrentHub().getScope().getSpan()) {
    return instrumentHandle(input);
  }
  return runWithAsyncContext(() => {
    return instrumentHandle(input);
  });
};

function instrumentHandle({ event, resolve }: Parameters<Handle>[0]): ReturnType<Handle> {
  const { traceparentData, dynamicSamplingContext } = getTracePropagationData(event);

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
    async (span?: Span) => {
      const res = await resolve(event, { transformPageChunk });
      if (span) {
        span.setHttpStatus(res.status);
      }
      return res;
    },
    sendErrorToSentry,
  );
}
