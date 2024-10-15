import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  getCurrentScope,
  getDefaultIsolationScope,
  getIsolationScope,
  getTraceMetaTags,
  setHttpStatus,
  withIsolationScope,
} from '@sentry/core';
import { startSpan } from '@sentry/core';
import { continueTrace } from '@sentry/node';
import type { Span } from '@sentry/types';
import { logger, winterCGRequestToRequestData } from '@sentry/utils';
import type { Handle, ResolveOptions } from '@sveltejs/kit';

import { DEBUG_BUILD } from '../common/debug-build';
import { flushIfServerless, getTracePropagationData, sendErrorToSentry } from './utils';

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
    const metaTags = getTraceMetaTags();
    const headWithMetaTags = metaTags ? `<head>\n${metaTags}` : '<head>';

    const headWithFetchScript = shouldInjectScript ? `\n<script ${nonce}>${FETCH_PROXY_SCRIPT}</script>` : '';

    const modifiedHead = `${headWithMetaTags}${headWithFetchScript}`;

    return html.replace('<head>', modifiedHead);
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
    // event.isSubRequest was added in SvelteKit 1.21.0 and we can use it to check
    // if we should create a new execution context or not.
    // In case of a same-origin `fetch` call within a server`load` function,
    // SvelteKit will actually just re-enter the `handle` function and set `isSubRequest`
    // to `true` so that no additional network call is made.
    // We want the `http.server` span of that nested call to be a child span of the
    // currently active span instead of a new root span to correctly reflect this
    // behavior.
    // As a fallback for Kit < 1.21.0, we check if there is an active span only if there's none,
    // we create a new execution context.
    const isSubRequest = typeof input.event.isSubRequest === 'boolean' ? input.event.isSubRequest : !!getActiveSpan();

    if (isSubRequest) {
      return instrumentHandle(input, options);
    }

    return withIsolationScope(isolationScope => {
      // We only call continueTrace in the initial top level request to avoid
      // creating a new root span for the sub request.
      isolationScope.setSDKProcessingMetadata({ request: winterCGRequestToRequestData(input.event.request.clone()) });
      return continueTrace(getTracePropagationData(input.event), () => instrumentHandle(input, options));
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

  const routeName = `${event.request.method} ${event.route?.id || event.url.pathname}`;

  if (getIsolationScope() !== getDefaultIsolationScope()) {
    getIsolationScope().setTransactionName(routeName);
  } else {
    DEBUG_BUILD && logger.warn('Isolation scope is default isolation scope - skipping setting transactionName');
  }

  try {
    const resolveResult = await startSpan(
      {
        op: 'http.server',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.sveltekit',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: event.route?.id ? 'route' : 'url',
          'http.method': event.request.method,
        },
        name: routeName,
      },
      async (span?: Span) => {
        getCurrentScope().setSDKProcessingMetadata({ request: winterCGRequestToRequestData(event.request.clone()) });
        const res = await resolve(event, {
          transformPageChunk: addSentryCodeToPage(options),
        });
        if (span) {
          setHttpStatus(span, res.status);
        }
        return res;
      },
    );
    return resolveResult;
  } catch (e: unknown) {
    sendErrorToSentry(e, 'handle');
    throw e;
  } finally {
    await flushIfServerless();
  }
}
