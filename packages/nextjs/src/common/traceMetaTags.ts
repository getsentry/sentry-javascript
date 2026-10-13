/**
 * Name of the meta tag the server writes instead of `sentry-trace` while Next.js prerenders a document.
 * Its content is the `sentry-trace` value of the prerender. A prerendered document is cached and served
 * to later visitors, so the client never continues it, it only marks the pageload as served from a
 * cached document and links the request that generated it.
 */
export const PRERENDER_META_TAG_NAME = 'sentry-prerender';
