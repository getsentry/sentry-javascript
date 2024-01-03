import { getCurrentScope, spanToTraceHeader } from '@sentry/core';
import { getActiveTransaction, runWithAsyncContext, startSpan } from '@sentry/core';
import { captureException } from '@sentry/node';
/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type { Span } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader, objectify } from '@sentry/utils';
import type { Handle, ResolveOptions } from '@sveltejs/kit';

import { isHttpError, isRedirect } from '../common/utils';
import { flushIfServerless, getTracePropagationData } from './utils';

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

  /**
   * Controls if `sentryHandle` should inject a script tag into the page that enables instrumentation
   * of `fetch` calls in `load` functions.
   *
   * @default true
   */
  injectFetchProxyScript?: boolean;

  /**
   * If this option is set, the `sentryHandle` handler will add a nonce attribute to the script
   * tag it injects into the page. This script is used to enable instrumentation of `fetch` calls
   * in `load` functions.
   *
   * Use this if your CSP policy blocks the fetch proxy script injected by `sentryHandle`.
   */
  fetchProxyScriptNonce?: string;
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

  captureException(objectifiedErr, {
    mechanism: {
      type: 'sveltekit',
      handled: false,
      data: {
        function: 'handle',
      },
    },
  });

  return objectifiedErr;
}

/**
 * Exported only for testing
 */
export const FETCH_PROXY_SCRIPT = `
    const f = window.fetch;
    if(f){
      window._sentryFetchProxy = function(...a){return f(...a)}
      window.fetch = function(...a){return window._sentryFetchProxy(...a)}
    }
`;

/**
 * Adds Sentry tracing <meta> tags to the returned html page.
 * Adds Sentry fetch proxy script to the returned html page if enabled in options.
 * Also adds a nonce attribute to the script tag if users specified one for CSP.
 *
 * Exported only for testing
 */
export function addSentryCodeToPage(options: SentryHandleOptions): NonNullable<ResolveOptions['transformPageChunk']> {
  const { fetchProxyScriptNonce, injectFetchProxyScript } = options;
  // if injectFetchProxyScript is not set, we default to true
  const shouldInjectScript = injectFetchProxyScript !== false;
  const nonce = fetchProxyScriptNonce ? `nonce="${fetchProxyScriptNonce}"` : '';

  return ({ html }) => {
    const transaction = getActiveTransaction();
    if (transaction) {
      const traceparentData = spanToTraceHeader(transaction);
      const dynamicSamplingContext = dynamicSamplingContextToSentryBaggageHeader(
        transaction.getDynamicSamplingContext(),
      );
      const contentMeta = `<head>
    <meta name="sentry-trace" content="${traceparentData}"/>
    <meta name="baggage" content="${dynamicSamplingContext}"/>
    `;
      const contentScript = shouldInjectScript ? `<script ${nonce}>${FETCH_PROXY_SCRIPT}</script>` : '';

      const content = `${contentMeta}\n${contentScript}`;

      return html.replace('<head>', content);
    }

    return html;
  };
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
 * export const handle = sentryHandle();
 *
 * // Optionally use the `sequence` function to add additional handlers.
 * // export const handle = sequence(sentryHandle(), yourCustomHandler);
 * ```
 */
export function sentryHandle(handlerOptions?: SentryHandleOptions): Handle {
  const options = {
    handleUnknownRoutes: false,
    injectFetchProxyScript: true,
    ...handlerOptions,
  };

  const sentryRequestHandler: Handle = input => {
    // if there is an active transaction, we know that this handle call is nested and hence
    // we don't create a new domain for it. If we created one, nested server calls would
    // create new transactions instead of adding a child span to the currently active span.
    if (getCurrentScope().getSpan()) {
      return instrumentHandle(input, options);
    }
    return runWithAsyncContext(() => {
      return instrumentHandle(input, options);
    });
  };

  return sentryRequestHandler;
}

async function instrumentHandle(
  { event, resolve }: Parameters<Handle>[0],
  options: SentryHandleOptions,
): Promise<Response> {
  if (!event.route?.id && !options.handleUnknownRoutes) {
    return resolve(event);
  }

  const { dynamicSamplingContext, traceparentData, propagationContext } = getTracePropagationData(event);
  getCurrentScope().setPropagationContext(propagationContext);

  try {
    const resolveResult = await startSpan(
      {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
        name: `${event.request.method} ${event.route?.id || event.url.pathname}`,
        status: 'ok',
        ...traceparentData,
        metadata: {
          source: event.route?.id ? 'route' : 'url',
          dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
        },
      },
      async (span?: Span) => {
        const res = await resolve(event, {
          transformPageChunk: addSentryCodeToPage(options),
        });
        if (span) {
          span.setHttpStatus(res.status);
        }
        return res;
      },
    );
    return resolveResult;
  } catch (e: unknown) {
    sendErrorToSentry(e);
    throw e;
  } finally {
    await flushIfServerless();
  }
}
