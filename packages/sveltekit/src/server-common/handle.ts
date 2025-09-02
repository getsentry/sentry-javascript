import type { Span } from '@sentry/core';
import {
  continueTrace,
  debug,
  flushIfServerless,
  getClient,
  getCurrentScope,
  getDefaultIsolationScope,
  getIsolationScope,
  getTraceMetaTags,
  httpHeadersToSpanAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  spanToJSON,
  startSpan,
  updateSpanName,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import type { Handle, ResolveOptions } from '@sveltejs/kit';
import { DEBUG_BUILD } from '../common/debug-build';
import { getTracePropagationData, sendErrorToSentry } from './utils';

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
};

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
 *
 * Exported only for testing
 */
export function addSentryCodeToPage(options: {
  injectFetchProxyScript: boolean;
}): NonNullable<ResolveOptions['transformPageChunk']> {
  return ({ html }) => {
    const metaTags = getTraceMetaTags();
    const headWithMetaTags = metaTags ? `<head>\n${metaTags}` : '<head>';

    const headWithFetchScript = options.injectFetchProxyScript ? `\n<script>${FETCH_PROXY_SCRIPT}</script>` : '';

    const modifiedHead = `${headWithMetaTags}${headWithFetchScript}`;

    return html.replace('<head>', modifiedHead);
  };
}

/**
 * We only need to inject the fetch proxy script for SvelteKit versions < 2.16.0.
 * Exported only for testing.
 */
export function isFetchProxyRequired(version: string): boolean {
  try {
    const [major, minor] = version.trim().replace(/-.*/, '').split('.').map(Number);
    if (major != null && minor != null && (major > 2 || (major === 2 && minor >= 16))) {
      return false;
    }
  } catch {
    // ignore
  }
  return true;
}

interface BackwardsForwardsCompatibleEvent {
  /**
   * For now taken from: https://github.com/sveltejs/kit/pull/13899
   * Access to spans for tracing. If tracing is not enabled or the function is being run in the browser, these spans will do nothing.
   * @since 2.31.0
   */
  tracing?: {
    /** Whether tracing is enabled. */
    enabled: boolean;
    current: Span;
    root: Span;
  };
}

async function instrumentHandle(
  {
    event,
    resolve,
  }: {
    event: Parameters<Handle>[0]['event'] & BackwardsForwardsCompatibleEvent;
    resolve: Parameters<Handle>[0]['resolve'];
  },
  options: SentryHandleOptions,
): Promise<Response> {
  const routeId = event.route?.id;

  if (!routeId && !options.handleUnknownRoutes) {
    return resolve(event);
  }

  // caching the result of the version check in `options.injectFetchProxyScript`
  // to avoid doing the dynamic import on every request
  if (options.injectFetchProxyScript == null) {
    try {
      // @ts-expect-error - the dynamic import is fine here
      const { VERSION } = await import('@sveltejs/kit');
      options.injectFetchProxyScript = isFetchProxyRequired(VERSION);
    } catch {
      options.injectFetchProxyScript = true;
    }
  }

  const routeName = `${event.request.method} ${routeId || event.url.pathname}`;

  if (getIsolationScope() !== getDefaultIsolationScope()) {
    getIsolationScope().setTransactionName(routeName);
  } else {
    DEBUG_BUILD && debug.warn('Isolation scope is default isolation scope - skipping setting transactionName');
  }

  // We only start a span if SvelteKit's native tracing is not enabled. Two reasons:
  // - Used Kit version doesn't yet support tracing
  // - Users didn't enable tracing
  const kitTracingEnabled = event.tracing?.enabled;

  try {
    const resolveWithSentry: (sentrySpan?: Span) => Promise<Response> = async (sentrySpan?: Span) => {
      getCurrentScope().setSDKProcessingMetadata({
        // We specifically avoid cloning the request here to avoid double read errors.
        // We only read request headers so we're not consuming the body anyway.
        // Note to future readers: This sounds counter-intuitive but please read
        // https://github.com/getsentry/sentry-javascript/issues/14583
        normalizedRequest: winterCGRequestToRequestData(event.request),
      });
      const kitRootSpan = event.tracing?.enabled ? event.tracing?.root : undefined;

      if (kitRootSpan) {
        // Update the root span emitted from SvelteKit to resemble a `http.server` span
        // We're doing this here instead of an event processor to ensure we update the
        // span name as early as possible (for dynamic sampling, et al.)
        // Other spans are enhanced in the `processKitSpans` integration.
        const spanJson = spanToJSON(kitRootSpan);
        const kitRootSpanAttributes = spanJson.data;
        const originalName = spanJson.description;

        const routeName = kitRootSpanAttributes['http.route'];
        if (routeName && typeof routeName === 'string') {
          updateSpanName(kitRootSpan, `${event.request.method ?? 'GET'} ${routeName}`);
        }

        kitRootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.sveltekit',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeName ? 'route' : 'url',
          'sveltekit.tracing.original_name': originalName,
          ...httpHeadersToSpanAttributes(
            winterCGHeadersToDict(event.request.headers),
            getClient()?.getOptions().sendDefaultPii ?? false,
          ),
        });
      }

      const res = await resolve(event, {
        transformPageChunk: addSentryCodeToPage({
          injectFetchProxyScript: options.injectFetchProxyScript ?? true,
        }),
      });

      if (sentrySpan) {
        setHttpStatus(sentrySpan, res.status);
      }

      return res;
    };

    const resolveResult = kitTracingEnabled
      ? await resolveWithSentry()
      : await startSpan(
          {
            op: 'http.server',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.sveltekit',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeId ? 'route' : 'url',
              'http.method': event.request.method,
              ...httpHeadersToSpanAttributes(
                winterCGHeadersToDict(event.request.headers),
                getClient()?.getOptions().sendDefaultPii ?? false,
              ),
            },
            name: routeName,
          },
          resolveWithSentry,
        );

    return resolveResult;
  } catch (e: unknown) {
    sendErrorToSentry(e, 'handle');
    throw e;
  } finally {
    await flushIfServerless();
  }
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
  const { handleUnknownRoutes, ...rest } = handlerOptions ?? {};
  const options = {
    handleUnknownRoutes: handleUnknownRoutes ?? false,
    ...rest,
  };

  const sentryRequestHandler: Handle = input => {
    const backwardsForwardsCompatibleEvent = input.event as typeof input.event & BackwardsForwardsCompatibleEvent;

    // Escape hatch to suppress request isolation and trace continuation (see initCloudflareSentryHandle)
    const skipIsolation =
      '_sentrySkipRequestIsolation' in backwardsForwardsCompatibleEvent.locals &&
      backwardsForwardsCompatibleEvent.locals._sentrySkipRequestIsolation;

    // In case of a same-origin `fetch` call within a server`load` function,
    // SvelteKit will actually just re-enter the `handle` function and set `isSubRequest`
    // to `true` so that no additional network call is made.
    // We want the `http.server` span of that nested call to be a child span of the
    // currently active span instead of a new root span to correctly reflect this
    // behavior.
    if (skipIsolation || input.event.isSubRequest) {
      return instrumentHandle(input, {
        ...options,
      });
    }

    return withIsolationScope(isolationScope => {
      // We only call continueTrace in the initial top level request to avoid
      // creating a new root span for the sub request.
      isolationScope.setSDKProcessingMetadata({
        // We specifically avoid cloning the request here to avoid double read errors.
        // We only read request headers so we're not consuming the body anyway.
        // Note to future readers: This sounds counter-intuitive but please read
        // https://github.com/getsentry/sentry-javascript/issues/14583
        normalizedRequest: winterCGRequestToRequestData(input.event.request),
      });

      if (backwardsForwardsCompatibleEvent.tracing?.enabled) {
        // if sveltekit tracing is enabled (since 2.31.0), trace continuation is handled by
        // kit before our hook is executed. No noeed to call `continueTrace` from our end
        return instrumentHandle(input, options);
      }

      return continueTrace(getTracePropagationData(input.event), () => instrumentHandle(input, options));
    });
  };

  return sentryRequestHandler;
}
