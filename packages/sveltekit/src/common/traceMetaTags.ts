/**
 * Replaces the trace meta tags of pages prerendered during the build. Empty, unlike in Next.js: spans
 * from the build are not reliably sent, so there is no origin to link.
 */
export const CACHE_ORIGIN_META_TAG_NAME = 'sentry-cache-origin';
