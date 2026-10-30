import {
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_FULL,
  URL_PATH,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import type { Client, Span, StartSpanOptions } from '@sentry/core';
import {
  filterCollectedUrl,
  getCurrentScope,
  hasSpanStreamingEnabled,
  PAGELOAD_SPAN_NAME_FALLBACK,
} from '@sentry/core';
import { resolveCurrentRoute, startBrowserTracingPageLoadSpan, WINDOW } from '@sentry/react';
import { stripTrailingSlash } from './parameterization';
import type { TraceMetaTagValues, TraceMetaTagWait } from './traceMetaTags';
import {
  addTraceMetaTagLink,
  canWaitForTraceMetaTag,
  readTraceMetaTags,
  waitForTraceMetaTag,
  withCacheOrigin,
} from './traceMetaTags';

/**
 * How long the pageload start may wait for the resumed part of a Cache Components document. The wait
 * normally ends with `DOMContentLoaded`; the cap only matters for a response the server keeps open.
 */
const PAGELOAD_TRACE_META_TAG_TIMEOUT_MS = 10_000;

let pendingPageloadWait: TraceMetaTagWait | undefined;

/**
 * Starts a pageload that is still waiting for its trace meta tag with a fresh trace. Called when a
 * navigation starts, before the navigation span is created, so the navigation ends the pageload like
 * any pageload it interrupts, and the pageload is still recorded.
 */
export function settlePendingPageloadWait(): void {
  pendingPageloadWait?.giveUp();
}

/**
 * Starts the pageload span with the request data of the document. The span may start after a
 * navigation already changed the location, so the browser SDK would otherwise read the new one.
 */
function startPageloadSpan(
  client: Client,
  spanOptions: StartSpanOptions,
  documentUrl: string,
  traceMetaTags?: TraceMetaTagValues,
): Span | undefined {
  const span = startBrowserTracingPageLoadSpan(client, withCacheOrigin(spanOptions, traceMetaTags), traceMetaTags);
  const scope = getCurrentScope();
  const { normalizedRequest } = scope.getScopeData().sdkProcessingMetadata;
  if (normalizedRequest) {
    scope.setSDKProcessingMetadata({ normalizedRequest: { ...normalizedRequest, url: documentUrl } });
  }
  return span;
}

/** Instruments the Next.js app router for pageloads. */
export function appRouterInstrumentPageLoad(client: Client): void {
  const documentUrl = filterCollectedUrl(WINDOW.location.href, client);
  const pathname = stripTrailingSlash(WINDOW.location.pathname);
  const parameterizedPathname = resolveCurrentRoute(client);
  const spanOptions: StartSpanOptions = {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
    name: parameterizedPathname ?? (hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : pathname),
    // pageload should always start at timeOrigin (and needs to be in s, not ms)
    attributes: {
      [SENTRY_OP]: PAGELOAD,
      [SENTRY_ORIGIN]: 'auto.pageload.nextjs.app_router_instrumentation',
      [SENTRY_SEGMENT_NAME_SOURCE]: parameterizedPathname ? 'route' : 'url',
      [URL_PATH]: WINDOW.location.pathname,
      [URL_FULL]: documentUrl,
      [URL_TEMPLATE]: parameterizedPathname,
    },
  };

  // A tag that is already in the document was rendered for this request and can be continued. A
  // Cache Components document that resumes a prerendered shell gets its tag with the resumed part,
  // which usually arrives after the SDK started. Waiting for it lets the pageload continue the server
  // trace instead of linking it; the span's start is backdated to the time origin either way.
  const traceMetaTags = readTraceMetaTags();
  if (traceMetaTags || !canWaitForTraceMetaTag()) {
    startPageloadSpan(client, spanOptions, documentUrl, traceMetaTags);
    return;
  }

  pendingPageloadWait = waitForTraceMetaTag(
    values => {
      pendingPageloadWait = undefined;
      startPageloadSpan(client, spanOptions, documentUrl, values);
    },
    () => {
      pendingPageloadWait = undefined;
      const span = startPageloadSpan(client, spanOptions, documentUrl);
      // Only reachable through the cap or a navigation while the document still streams: a tag that
      // shows up after this can no longer be continued, but the server request can still be linked.
      if (span) {
        waitForTraceMetaTag(
          values => span.isRecording() && addTraceMetaTagLink(span, values),
          () => undefined,
        );
      }
    },
    PAGELOAD_TRACE_META_TAG_TIMEOUT_MS,
  );
}
