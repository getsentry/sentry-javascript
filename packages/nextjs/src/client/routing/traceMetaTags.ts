import type { Span } from '@sentry/core';
import { extractTraceparentData } from '@sentry/core';
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
 * Whether the SDK can still expect a `sentry-trace` meta tag to arrive: the document is streaming
 * and nothing else already carries the trace.
 */
export function canWaitForTraceMetaTag(): boolean {
  return (
    getDocument()?.readyState === 'loading' && typeof MutationObserver !== 'undefined' && !hasServerTimingTraceContext()
  );
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
 * right away when `canWaitForTraceMetaTag()` is false.
 */
export function waitForTraceMetaTag(
  onTag: (values: TraceMetaTagValues) => void,
  onGiveUp: () => void,
  timeoutMs?: number,
): TraceMetaTagWait {
  const document = getDocument();
  if (!document || !canWaitForTraceMetaTag()) {
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
  });
}
