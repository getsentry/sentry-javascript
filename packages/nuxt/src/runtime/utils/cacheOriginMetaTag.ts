/**
 * Replaces `sentry-trace` and `baggage` in a page that other visitors get too. Holds the `sentry-trace`
 * value of the render, or nothing for a build prerender. The client links it and never continues it.
 */
export const CACHE_ORIGIN_META_TAG_NAME = 'sentry-cache-origin';
