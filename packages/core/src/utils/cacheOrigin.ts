import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { SpanLink } from '../types/link';
import type { StartSpanOptions } from '../types/startSpanOptions';
import { getActiveSpan, getRootSpan, TRACE_FLAG_SAMPLED } from './spanUtils';
import { getTraceData } from './traceData';
import { extractTraceparentData } from './tracing';
import { GLOBAL_OBJ } from './worldwide';

/**
 * Replaces `sentry-trace` and `baggage` in a cached or prerendered page, so that no visitor continues the
 * trace of the render.
 *
 * - No tag: the server rendered the page for this request, or rendered no content (a client-side shell)
 * - Empty `content`: there is no trace of the render to link, for example for a page prerendered in the build
 * - A `sentry-trace` value: the client links the render
 */
export const _INTERNAL_CACHE_ORIGIN_META_TAG_NAME = 'sentry-cache-origin';

/** Returns the `sentry-cache-origin` meta tag. Without `renderTrace`, the tag is empty. */
export function _INTERNAL_getCacheOriginMetaTag(renderTrace: string | undefined): string {
  return `<meta name="${_INTERNAL_CACHE_ORIGIN_META_TAG_NAME}" content="${renderTrace ?? ''}"/>`;
}

/**
 * Returns the `sentry-trace` of the request's root span, which a cached page links as its render. Unlike
 * `getTraceData()`, it ignores an active child span, such as SvelteKit's `sveltekit.resolve`.
 */
export function _INTERNAL_getRootSpanSentryTrace(): string | undefined {
  const activeSpan = getActiveSpan();
  return getTraceData({ span: activeSpan && getRootSpan(activeSpan) })['sentry-trace'];
}

/**
 * Sets `page.server_rendering.type` on a pageload whose document has a `sentry-cache-origin` tag, even an
 * empty one. Links the render if the tag holds the `sentry-trace` of a sampled render. Pass `undefined` as
 * `serverRenderingType` while the type is not known.
 *
 * Call it before the span starts, so `tracesSampler` and `ignoreSpans` see the attribute.
 */
export function _INTERNAL_withCacheOrigin(
  spanOptions: StartSpanOptions,
  serverRenderingType: 'static' | 'partially_static' | undefined,
): StartSpanOptions {
  const renderTrace = (GLOBAL_OBJ as { document?: Document }).document
    ?.querySelector(`meta[name="${_INTERNAL_CACHE_ORIGIN_META_TAG_NAME}"]`)
    ?.getAttribute('content');
  if (renderTrace == null) {
    return spanOptions;
  }

  const link = getSampledRenderLink(renderTrace);
  return {
    ...spanOptions,
    attributes: {
      ...spanOptions.attributes,
      ...(serverRenderingType && { [PAGE_SERVER_RENDERING_TYPE]: serverRenderingType }),
    },
    ...(link && { links: [...(spanOptions.links ?? []), link] }),
  };
}

// Only a sampled render sent spans, so a link to any other render would point at nothing.
function getSampledRenderLink(renderTrace: string): SpanLink | undefined {
  const traceparent = extractTraceparentData(renderTrace);
  if (!traceparent?.traceId || !traceparent.parentSpanId || !traceparent.parentSampled) {
    return undefined;
  }
  return {
    context: { traceId: traceparent.traceId, spanId: traceparent.parentSpanId, traceFlags: TRACE_FLAG_SAMPLED },
    attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
  };
}
