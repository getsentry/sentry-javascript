import { PAGE_SERVER_RENDERING_TYPE } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { WINDOW } from '@sentry/svelte';
import { CACHE_ORIGIN_META_TAG_NAME } from '../common/traceMetaTags';

/** Set at span start, so `tracesSampler` sees it. */
export function getServerRenderingAttributes(): SpanAttributes {
  const isPrerendered = !!WINDOW.document?.querySelector(`meta[name="${CACHE_ORIGIN_META_TAG_NAME}"]`);
  return isPrerendered ? { [PAGE_SERVER_RENDERING_TYPE]: 'static' } : {};
}
