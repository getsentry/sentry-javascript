import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { SpanLink, StartSpanOptions } from '@sentry/core';
import { extractTraceparentData } from '@sentry/core';
import { WINDOW } from '@sentry/svelte';
import { CACHE_ORIGIN_META_TAG_NAME } from '../common/traceMetaTags';

// `@opentelemetry/api` `TraceFlags.SAMPLED`, inlined because core does not export its copy.
const TRACE_FLAG_SAMPLED = 0x1;

/**
 * Marks the pageload of a reused page as `static` at span start, so `tracesSampler` sees it. Links the
 * render only if it was sampled, like every `cache_origin` link.
 */
export function withCacheOrigin(spanOptions: StartSpanOptions): StartSpanOptions {
  const cacheOrigin = WINDOW.document
    ?.querySelector(`meta[name="${CACHE_ORIGIN_META_TAG_NAME}"]`)
    ?.getAttribute('content');
  if (cacheOrigin == null) {
    return spanOptions;
  }

  const link = getSampledCacheOriginLink(cacheOrigin);
  return {
    ...spanOptions,
    attributes: { ...spanOptions.attributes, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
    ...(link && { links: [link] }),
  };
}

function getSampledCacheOriginLink(sentryTrace: string): SpanLink | undefined {
  const traceparent = extractTraceparentData(sentryTrace);
  if (!traceparent?.traceId || !traceparent.parentSpanId || !traceparent.parentSampled) {
    return undefined;
  }
  return {
    context: { traceId: traceparent.traceId, spanId: traceparent.parentSpanId, traceFlags: TRACE_FLAG_SAMPLED },
    attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
  };
}
