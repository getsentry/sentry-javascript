import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { Client, Span } from '@sentry/core';
import { _INTERNAL_CACHE_ORIGIN_META_TAG_NAME, extractTraceparentData, GLOBAL_OBJ } from '@sentry/core';
import { WINDOW } from '@sentry/react';

// `@opentelemetry/api` `TraceFlags`, inlined because core does not export its copies.
const TRACE_FLAG_SAMPLED = 0x1;
const TRACE_FLAG_NONE = 0x0;

export interface TraceMetaTagValues {
  sentryTrace: string;
  baggage: string | undefined;
}

function getDocument(): Document | undefined {
  return WINDOW.document;
}

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryCacheComponents?: string };

/** Whether the build enabled `cacheComponents`, so a document can resume a prerendered shell. */
function hasCacheComponents(): boolean {
  return (process.env._sentryCacheComponents ?? globalWithInjectedValues._sentryCacheComponents) === 'true';
}

function lastMetaContent(document: Document, name: string): string | undefined {
  const tags = document.querySelectorAll(`meta[name="${name}"]`);
  return tags[tags.length - 1]?.getAttribute('content') || undefined;
}

/**
 * Reads the `sentry-trace` and `baggage` meta tags of the document. The server only writes them for
 * a render that happened for this request (see `nextSentryPropagator.ts`), so whichever tag is
 * present may be continued. The last one wins: a document stitched from a shell and a resumed part
 * carries the resumed part's tag last.
 */
export function readTraceMetaTags(): TraceMetaTagValues | undefined {
  const document = getDocument();
  const sentryTrace = document && lastMetaContent(document, 'sentry-trace');
  return document && sentryTrace ? { sentryTrace, baggage: lastMetaContent(document, 'baggage') } : undefined;
}

/**
 * Whether the response carried the trace in a `Server-Timing` header. The generic browser tracing
 * integration continues it when it starts the pageload, so there is nothing to wait for.
 */
export function hasServerTimingTraceContext(): boolean {
  // The cast is required for the declaration build, which resolves `getEntriesByType('navigation')`
  // to `PerformanceEntry[]` without `serverTiming`.
  const navigation = WINDOW.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return !!navigation?.serverTiming?.some(entry => entry.name === 'sentry-trace');
}

/**
 * Whether a `sentry-trace` meta tag can still arrive: the app has `cacheComponents` enabled, so a
 * document can resume a prerendered shell and get its tag with the resumed part, and the document is
 * still streaming. Without `cacheComponents` a tag is either in `<head>` from the start or never comes.
 */
function canObserveTraceMetaTag(): boolean {
  return hasCacheComponents() && getDocument()?.readyState === 'loading' && typeof MutationObserver !== 'undefined';
}

/**
 * Whether the pageload should hold its start for a `sentry-trace` meta tag: one can still arrive, and
 * nothing else already carries the trace. With a `Server-Timing` header the pageload continues the
 * trace at once, and a tag can only still settle how the server rendered the page.
 */
export function canWaitForTraceMetaTag(): boolean {
  return canObserveTraceMetaTag() && !hasServerTimingTraceContext();
}

export interface TraceMetaTagWait {
  /** Stops waiting and reports that no tag will be used, unless the wait already settled. */
  giveUp(): void;
}

/**
 * Waits for a `sentry-trace` meta tag to show up while the document is still streaming. The resumed
 * part of a Cache Components page arrives after the SDK started whenever the dynamic hole takes
 * longer than loading the SDK, which is the common case.
 *
 * Calls `onTag` once with the tag, or `onGiveUp` once when the document finished parsing without
 * one, `timeoutMs` passed, or `giveUp()` was called, whichever comes first. Settles with `onGiveUp`
 * right away when no tag can arrive anymore.
 */
export function waitForTraceMetaTag(
  onTag: (values: TraceMetaTagValues) => void,
  onGiveUp: () => void,
  timeoutMs?: number,
): TraceMetaTagWait {
  const document = getDocument();
  if (!document || !canObserveTraceMetaTag()) {
    onGiveUp();
    return { giveUp: () => undefined };
  }

  let settled = false;
  const settle = (callback: () => void): void => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    observer.disconnect();
    document.removeEventListener('DOMContentLoaded', onDocumentParsed);
    callback();
  };

  const checkForTag = (): boolean => {
    const values = readTraceMetaTags();
    if (values) {
      settle(() => onTag(values));
    }
    return !!values;
  };

  // The tag can sit in the last chunk, whose mutation records may not have been delivered yet.
  const onDocumentParsed = (): void => {
    if (!checkForTag()) {
      settle(onGiveUp);
    }
  };

  const observer = new MutationObserver(checkForTag);
  const timeout = timeoutMs === undefined ? undefined : setTimeout(() => settle(onGiveUp), timeoutMs);

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', onDocumentParsed);

  return { giveUp: () => settle(onGiveUp) };
}

/**
 * Adds a span link to the span described by a `sentry-trace` value. Used when the tag arrives after
 * the pageload span exists, which can only link the server request, not continue it.
 */
export function addTraceMetaTagLink(span: Span, { sentryTrace }: TraceMetaTagValues): void {
  const traceparent = extractTraceparentData(sentryTrace);
  if (!traceparent?.traceId || !traceparent.parentSpanId) {
    return;
  }
  span.addLink({
    context: {
      traceId: traceparent.traceId,
      spanId: traceparent.parentSpanId,
      traceFlags: traceparent.parentSampled ? TRACE_FLAG_SAMPLED : TRACE_FLAG_NONE,
    },
    attributes: { [SENTRY_LINK_TYPE]: 'server_request' },
  });
}

/**
 * Watches for a `sentry-trace` meta tag that arrives after the pageload span started, which can no
 * longer be continued. It still settles how the server rendered a document with a
 * `sentry-cache-origin` tag, and links the server request unless a `Server-Timing` header already
 * connected the pageload to it. Stops watching when the span ends: a dynamic part that outlasts the
 * pageload leaves the type unset.
 */
export function observeLateTraceMetaTag(client: Client, span: Span): void {
  const document = getDocument();
  if (!document || !canObserveTraceMetaTag()) {
    return;
  }

  const hasCacheOrigin = !!document.querySelector(`meta[name="${_INTERNAL_CACHE_ORIGIN_META_TAG_NAME}"]`);
  const isConnected = hasServerTimingTraceContext();
  let stopListening: (() => void) | undefined;
  const settle = (type: string): void => {
    stopListening?.();
    if (hasCacheOrigin && span.isRecording()) {
      span.setAttribute(PAGE_SERVER_RENDERING_TYPE, type);
    }
  };

  const wait = waitForTraceMetaTag(
    values => {
      if (!isConnected && span.isRecording()) {
        addTraceMetaTagLink(span, values);
      }
      settle('partially_static');
    },
    () => settle('static'),
  );
  stopListening = client.on('spanEnd', endedSpan => {
    if (endedSpan === span) {
      wait.giveUp();
    }
  });
}

/**
 * How the server rendered a document with a `sentry-cache-origin` tag. With trace meta tags of this
 * request, only the shell was reused. Unset while a resumed part can still bring those tags.
 */
export function getServerRenderingType(
  traceMetaTags: TraceMetaTagValues | undefined,
): 'static' | 'partially_static' | undefined {
  if (traceMetaTags) {
    return 'partially_static';
  }
  return canObserveTraceMetaTag() ? undefined : 'static';
}
