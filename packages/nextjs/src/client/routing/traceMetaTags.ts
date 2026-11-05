import { SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { Span, SpanLink, StartSpanOptions } from '@sentry/core';
import { extractTraceparentData, GLOBAL_OBJ } from '@sentry/core';
import { CACHE_ORIGIN_META_TAG_NAME } from '../../common/traceMetaTags';
import { WINDOW } from '@sentry/react';

// `@opentelemetry/api` `TraceFlags`, inlined because core does not export its copies.
const TRACE_FLAG_SAMPLED = 0x1;
const TRACE_FLAG_NONE = 0x0;

const SERVER_REQUEST_LINK_TYPE = 'server_request';
const CACHE_ORIGIN_LINK_TYPE = 'cache_origin';

export interface TraceMetaTagValues {
  sentryTrace: string;
  baggage: string | undefined;
}

// Not in `@sentry/conventions` yet: https://github.com/getsentry/sentry-conventions/pull/740
const PAGE_SERVER_RENDERING_TYPE = 'page.server_rendering.type';

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
 * Whether the SDK can still expect a `sentry-trace` meta tag to arrive: the app has `cacheComponents`
 * enabled, so a document can resume a prerendered shell and get its tag with the resumed part, the
 * document is still streaming, and nothing else already carries the trace. Without `cacheComponents`
 * a tag is either in `<head>` from the start or never comes, so waiting would only hold the pageload
 * back.
 */
export function canWaitForTraceMetaTag(): boolean {
  return (
    hasCacheComponents() &&
    getDocument()?.readyState === 'loading' &&
    typeof MutationObserver !== 'undefined' &&
    !hasServerTimingTraceContext()
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

/** The span link to the span a `sentry-trace` value describes, if the value is one. */
function traceMetaTagLink(sentryTrace: string, linkType: string): SpanLink | undefined {
  const traceparent = extractTraceparentData(sentryTrace);
  if (!traceparent?.traceId || !traceparent.parentSpanId) {
    return undefined;
  }
  return {
    context: {
      traceId: traceparent.traceId,
      spanId: traceparent.parentSpanId,
      traceFlags: traceparent.parentSampled ? TRACE_FLAG_SAMPLED : TRACE_FLAG_NONE,
    },
    attributes: { [SENTRY_LINK_TYPE]: linkType },
  };
}

/**
 * Adds a span link to the span described by a `sentry-trace` value. Used when the tag arrives after
 * the pageload span exists, which can only link the server request, not continue it.
 */
export function addTraceMetaTagLink(span: Span, { sentryTrace }: TraceMetaTagValues): void {
  const link = traceMetaTagLink(sentryTrace, SERVER_REQUEST_LINK_TYPE);
  if (link) {
    span.addLink(link);
  }
}

/**
 * How the server rendered a document with a `sentry-cache-origin` tag. With trace meta tags of this
 * request, only the shell was reused. Unset while a resumed part can still bring those tags.
 */
function getServerRenderingType(traceMetaTags: TraceMetaTagValues | undefined): string | undefined {
  if (traceMetaTags) {
    return 'partially_static';
  }
  return canWaitForTraceMetaTag() ? undefined : 'static';
}

/**
 * Marks a pageload whose document carries a `sentry-cache-origin` tag with how the server rendered
 * it, and links the render that the page reuses. Applied at span start, so `tracesSampler` and
 * `ignoreSpans` see both. Like a `use cache` hit, the pageload links only a sampled render.
 */
export function withCacheOrigin(spanOptions: StartSpanOptions, traceMetaTags?: TraceMetaTagValues): StartSpanOptions {
  const document = getDocument();
  const cacheOrigin = document && lastMetaContent(document, CACHE_ORIGIN_META_TAG_NAME);
  if (!cacheOrigin) {
    return spanOptions;
  }

  const link = traceMetaTagLink(cacheOrigin, CACHE_ORIGIN_LINK_TYPE);
  const isSampled = link?.context.traceFlags === TRACE_FLAG_SAMPLED;
  const serverRenderingType = getServerRenderingType(traceMetaTags);
  return {
    ...spanOptions,
    attributes: {
      ...spanOptions.attributes,
      ...(serverRenderingType && { [PAGE_SERVER_RENDERING_TYPE]: serverRenderingType }),
    },
    links: link && isSampled ? [...(spanOptions.links ?? []), link] : spanOptions.links,
  };
}
