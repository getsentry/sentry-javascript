/**
 * Replaces the trace meta tags of pages that are reused. Holds the `sentry-trace` of the render that a
 * Vercel ISR page reuses, or is empty for a page prerendered during the build: spans from the build are
 * not reliably sent, so there is no origin to link.
 */
export const CACHE_ORIGIN_META_TAG_NAME = 'sentry-cache-origin';
