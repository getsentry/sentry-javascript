import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { SpanLink } from '../types/link';
import type { Span } from '../types/span';
import type { StartSpanOptions } from '../types/startSpanOptions';
import { getActiveSpan, getRootSpan, spanToJSON, TRACE_FLAG_SAMPLED } from './spanUtils';
import { browserPerformanceTimeOrigin } from './time';
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

/**
 * Holds the start of the render of a cached or prerendered page, as UNIX time in whole seconds. The server writes it
 * next to `sentry-cache-origin`, also when that tag is empty. The client turns it into `page.server_rendering.age`.
 */
export const _INTERNAL_RENDER_START_META_TAG_NAME = 'sentry-render-start';

// TODO: Use the constant from `@sentry/conventions` when https://github.com/getsentry/sentry-conventions/pull/799 is released.
const PAGE_SERVER_RENDERING_AGE = 'page.server_rendering.age';

/**
 * Returns the `sentry-cache-origin` meta tag and the `sentry-render-start` meta tag for the request that rendered the
 * page. Without `renderTrace`, the `sentry-cache-origin` tag is empty. `requestStart` is in seconds.
 */
export function _INTERNAL_getCacheOriginMetaTags(renderTrace: string | undefined, requestStart: number): string {
  const renderStart = _INTERNAL_getRenderStart(getActiveRootSpan(), requestStart);
  return [
    `<meta name="${_INTERNAL_CACHE_ORIGIN_META_TAG_NAME}" content="${renderTrace ?? ''}"/>`,
    `<meta name="${_INTERNAL_RENDER_START_META_TAG_NAME}" content="${renderStart}"/>`,
  ].join('\n');
}

/**
 * Returns the `sentry-trace` of the request's root span, which a cached page links as its render. Unlike
 * `getTraceData()`, it ignores an active child span, such as SvelteKit's `sveltekit.resolve`.
 */
export function _INTERNAL_getRootSpanSentryTrace(): string | undefined {
  return getTraceData({ span: getActiveRootSpan() })['sentry-trace'];
}

/**
 * Returns the start of a render as UNIX time in whole seconds: the start of `span` if it records, because the
 * `cache_origin` link points to it, else `startWithoutSpan` (in seconds), for example in the build or in an unsampled
 * request. The age needs no more precision, and whole seconds make the server clock harder to fingerprint.
 */
export function _INTERNAL_getRenderStart(span: Span | undefined, startWithoutSpan: number): number {
  return Math.floor(span?.isRecording() ? spanToJSON(span).start_timestamp : startWithoutSpan);
}

function getActiveRootSpan(): Span | undefined {
  const activeSpan = getActiveSpan();
  return activeSpan && getRootSpan(activeSpan);
}

/**
 * Sets `page.server_rendering.type` on a pageload whose document has a `sentry-cache-origin` tag, even an
 * empty one. Links the render if the tag holds the `sentry-trace` of a sampled render, and sets
 * `page.server_rendering.age` if the document has a `sentry-render-start` tag. Pass `undefined` as
 * `serverRenderingType` while the type is not known.
 *
 * Call it before the span starts, so `tracesSampler` and `ignoreSpans` see the attribute.
 */
export function _INTERNAL_withCacheOrigin(
  spanOptions: StartSpanOptions,
  serverRenderingType: 'static' | 'partially_static' | undefined,
): StartSpanOptions {
  const renderTrace = getMetaTagContent(_INTERNAL_CACHE_ORIGIN_META_TAG_NAME);
  if (renderTrace == null) {
    return spanOptions;
  }

  const link = getSampledRenderLink(renderTrace);
  const renderAge = getRenderAge(getMetaTagContent(_INTERNAL_RENDER_START_META_TAG_NAME));
  return {
    ...spanOptions,
    attributes: {
      ...spanOptions.attributes,
      ...(serverRenderingType && { [PAGE_SERVER_RENDERING_TYPE]: serverRenderingType }),
      ...(renderAge !== undefined && { [PAGE_SERVER_RENDERING_AGE]: renderAge }),
    },
    ...(link && { links: [...(spanOptions.links ?? []), link] }),
  };
}

function getMetaTagContent(name: string): string | null | undefined {
  return (GLOBAL_OBJ as { document?: Document }).document
    ?.querySelector(`meta[name="${name}"]`)
    ?.getAttribute('content');
}

// Cap at 1 year. It's unlikely that an older server time is still correct
const MAX_RENDER_AGE = 365 * 24 * 60 * 60;

// A pageload starts at the time origin. The server and the browser clocks differ, so a render shortly before the
// pageload can seem to start after it.
function getRenderAge(renderStart: string | null | undefined): number | undefined {
  const timeOrigin = browserPerformanceTimeOrigin();
  if (!renderStart || !/^\d+$/.test(renderStart) || !timeOrigin) {
    return undefined;
  }
  const age = Math.max(0, Math.floor(timeOrigin / 1000 - Number(renderStart)));
  return age <= MAX_RENDER_AGE ? age : undefined;
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
