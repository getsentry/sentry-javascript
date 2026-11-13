/**
 * Replaces `sentry-trace` and `baggage` in a page that many visitors get. Holds the `sentry-trace` of the
 * render to link, or is empty. The client links it but never continues it.
 */
export const CACHE_ORIGIN_META_TAG_NAME = 'sentry-cache-origin';
