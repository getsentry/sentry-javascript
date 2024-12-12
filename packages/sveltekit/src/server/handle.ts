import type { Span } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  continueTrace,
  getCurrentScope,
  getDefaultIsolationScope,
  getIsolationScope,
  getTraceMetaTags,
  logger,
  setHttpStatus,
  startSpan,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import type { Handle, ResolveOptions } from '@sveltejs/kit';

import type { SentryHandleOptions } from '../server-common/handle';
import { sentryHandleGeneric } from '../server-common/handle';

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
    // In case of a same-origin `fetch` call within a server`load` function,
    // SvelteKit will actually just re-enter the `handle` function and set `isSubRequest`
    // to `true` so that no additional network call is made.
    // We want the `http.server` span of that nested call to be a child span of the
    // currently active span instead of a new root span to correctly reflect this
    // behavior.
    if (input.event.isSubRequest) {
      return instrumentHandle(input, options);
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
        getCurrentScope().setSDKProcessingMetadata({
          // We specifically avoid cloning the request here to avoid double read errors.
          // We only read request headers so we're not consuming the body anyway.
          // Note to future readers: This sounds counter-intuitive but please read
          // https://github.com/getsentry/sentry-javascript/issues/14583
          normalizedRequest: winterCGRequestToRequestData(event.request),
        });
        const res = await resolve(event, {
          transformPageChunk: addSentryCodeToPage({ injectFetchProxyScript: options.injectFetchProxyScript ?? true }),
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
