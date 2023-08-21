/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type { Span } from '@sentry/core';
import { getActiveTransaction, getCurrentHub, runWithAsyncContext, trace } from '@sentry/core';
import { captureException } from '@sentry/node';
import { addExceptionMechanism, dynamicSamplingContextToSentryBaggageHeader, objectify } from '@sentry/utils';
import type { Handle, ResolveOptions } from '@sveltejs/kit';

import { isHttpError, isRedirect } from '../common/utils';
import { getTracePropagationData } from './utils';

export type SentryHandleOptions = {
  /**
   * Controls whether the SDK should capture errors and traces in requests that don't belong to a
   * route defined in your SvelteKit application.
   *
   * By default, this option is set to `false` to reduce noise (e.g. bots sending random requests to your server).
   *
   * Set this option to `true` if you want to monitor requests events without a route. This might be useful in certain
   * scenarios, for instance if you registered other handlers that handle these requests.
   * If you set this option, you might want adjust the the transaction name in the `beforeSendTransaction`
   * callback of your server-side `Sentry.init` options. You can also use `beforeSendTransaction` to filter out
   * transactions that you still don't want to be sent to Sentry.
   *
   * @default false
   */
  handleUnknownRoutes?: boolean;
};

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

const FETCH_PROXY_SCRIPT = `
    const f = window.fetch;
    if(f){
      window._sentryFetchProxy = function(...a){return f(...a)}
      window.fetch = function(...a){return window._sentryFetchProxy(...a)}
    }
`;

export const transformPageChunk: NonNullable<ResolveOptions['transformPageChunk']> = ({ html }) => {
  const transaction = getActiveTransaction();
  if (transaction) {
    const traceparentData = transaction.toTraceparent();
    const dynamicSamplingContext = dynamicSamplingContextToSentryBaggageHeader(transaction.getDynamicSamplingContext());
    const content = `<head>
  <meta name="sentry-trace" content="${traceparentData}"/>
  <meta name="baggage" content="${dynamicSamplingContext}"/>
  <script>${FETCH_PROXY_SCRIPT}
  </script>
  `;
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
export function sentryHandle(handlerOptions?: SentryHandleOptions): Handle {
  const options = {
    handleUnknownRoutes: false,
    ...handlerOptions,
  };

  const sentryRequestHandler: Handle = input => {
    // if there is an active transaction, we know that this handle call is nested and hence
    // we don't create a new domain for it. If we created one, nested server calls would
    // create new transactions instead of adding a child span to the currently active span.
    if (getCurrentHub().getScope().getSpan()) {
      return instrumentHandle(input, options);
    }
    return runWithAsyncContext(() => {
      return instrumentHandle(input, options);
    });
  };

  return sentryRequestHandler;
}

function instrumentHandle({ event, resolve }: Parameters<Handle>[0], options: SentryHandleOptions): ReturnType<Handle> {
  if (!event.route?.id && !options.handleUnknownRoutes) {
    return resolve(event);
  }

  const { dynamicSamplingContext, traceparentData, propagationContext } = getTracePropagationData(event);
  getCurrentHub().getScope().setPropagationContext(propagationContext);

  return trace(
    {
      op: 'http.server',
      name: `${event.request.method} ${event.route?.id || event.url.pathname}`,
      status: 'ok',
      ...traceparentData,
      metadata: {
        source: event.route?.id ? 'route' : 'url',
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
