import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import type { SpanLink, StartSpanOptions } from '@sentry/core';
import { extractTraceparentData } from '@sentry/core';
import { WINDOW } from '@sentry/vue';
import { CACHE_ORIGIN_META_TAG_NAME } from './cacheOriginMetaTag';

// `@opentelemetry/api` `TraceFlags`, inlined because core does not export its copies.
const TRACE_FLAG_SAMPLED = 0x1;

/** The `cache_origin` link to the sampled render that a `sentry-trace` value describes. */
function getCacheOriginLink(sentryTrace: string): SpanLink | undefined {
  const traceparent = extractTraceparentData(sentryTrace);
  if (!traceparent?.traceId || !traceparent.parentSpanId || !traceparent.parentSampled) {
    return undefined;
  }
  return {
    context: { traceId: traceparent.traceId, spanId: traceparent.parentSpanId, traceFlags: TRACE_FLAG_SAMPLED },
    attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
  };
}

/**
 * Marks the pageload of a reused page as `static` and links the render if it was sampled (as in Next.js).
 * Runs at span start, so `tracesSampler` and `ignoreSpans` see the attribute. A client-side shell
 * (`ssr: false`) stays unmarked, because the server rendered none of its content.
 */
export function withCacheOrigin(spanOptions: StartSpanOptions, isServerRendered: boolean): StartSpanOptions {
  if (spanOptions.op !== PAGELOAD || !isServerRendered) {
    return spanOptions;
  }

  const cacheOrigin = WINDOW.document
    ?.querySelector(`meta[name="${CACHE_ORIGIN_META_TAG_NAME}"]`)
    ?.getAttribute('content');
  if (typeof cacheOrigin !== 'string') {
    return spanOptions;
  }

  const link = getCacheOriginLink(cacheOrigin);
  return {
    ...spanOptions,
    attributes: { ...spanOptions.attributes, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
    links: link ? [...(spanOptions.links ?? []), link] : spanOptions.links,
  };
}
