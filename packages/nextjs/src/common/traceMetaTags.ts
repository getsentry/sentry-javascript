/**
 * Name of the meta tag the server writes in place of `sentry-trace` while Next.js prerenders a document.
 * Its content is the `sentry-trace` value of the prerender. The client turns it into a `cache_origin`
 * link and never continues it, because the document is served to every later visitor.
 */
export const CACHE_ORIGIN_META_TAG_NAME = 'sentry-cache-origin';
