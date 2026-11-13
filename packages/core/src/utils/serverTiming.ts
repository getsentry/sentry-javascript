import type { SerializedTraceData } from '../types/tracing';
import { safeDateNow } from './randomSafeContext';
import { getTraceData } from './traceData';

/**
 * Returns the value of a `Server-Timing` response header that carries the current trace data.
 *
 * The browser SDK reads it off the document response to continue the trace of the server request in
 * the pageload span. Unlike the meta tags of `getTraceMetaTags`, the header reaches the browser before
 * any HTML, so the pageload never has to wait for a tag. The value holds up to two entries,
 * `sentry-trace` and `baggage`, and is empty without trace data.
 *
 * @example
 * ```js
 * response.setHeader('Server-Timing', getTraceServerTimingHeader());
 * ```
 */
export function getTraceServerTimingHeader(traceData?: SerializedTraceData): string {
  return Object.entries(traceData || getTraceData())
    .filter(([, value]) => value)
    .map(([key, value]) => `${key};desc="${value}"`)
    .join(', ');
}

// Cache-control fields a CDN reads instead of `Cache-Control`.
const CDN_CACHE_CONTROL_HEADERS = [
  'cdn-cache-control',
  'cloudflare-cdn-cache-control',
  'vercel-cdn-cache-control',
  'surrogate-control',
];

/**
 * Whether a cache in front of the app may store a response and serve it to other users. Such a
 * response must not carry the trace of one request, in a `Server-Timing` header or otherwise, since
 * the cache would hand it to every later visitor.
 *
 * A CDN that reads a targeted field ignores `Cache-Control`; a cache without targeted support reads
 * `Cache-Control`. Any of them storing the response is enough.
 *
 * @param getHeader Reads a response header by its lowercase name.
 */
export function isSharedCacheable(getHeader: (name: string) => string | undefined): boolean {
  for (const name of CDN_CACHE_CONTROL_HEADERS) {
    const value = getHeader(name);
    if (value !== undefined && sharedCachingVerdict(value.toLowerCase()) === true) {
      return true;
    }
  }

  const verdict = sharedCachingVerdict(getHeader('cache-control')?.toLowerCase() ?? '');
  if (verdict !== undefined) {
    return verdict;
  }
  // Without a lifetime in `Cache-Control`, a cache falls back to `Expires`.
  const expires = getHeader('expires');
  return expires !== undefined && Date.parse(expires) > safeDateNow();
}

/** Whether these directives let a shared cache reuse the response, or `undefined` when they say nothing. */
function sharedCachingVerdict(directives: string): boolean | undefined {
  if (/\b(?:no-store|private)\b/.test(directives)) {
    return false;
  }
  // A stale copy is served even after a zero lifetime.
  if (/\b(?:stale-while-revalidate|stale-if-error)\s*=\s*[1-9]/.test(directives)) {
    return true;
  }
  // `s-maxage` overrides `max-age` for shared caches. A zero lifetime means the cache revalidates
  // every time, so it never serves this response to anyone else.
  const sharedMaxAge = directives.match(/\bs-maxage\s*=\s*(\d+)/)?.[1];
  if (sharedMaxAge !== undefined) {
    return Number(sharedMaxAge) > 0;
  }
  if (/\bpublic\b/.test(directives)) {
    return true;
  }
  const maxAge = directives.match(/\bmax-age\s*=\s*(\d+)/)?.[1];
  if (maxAge !== undefined) {
    return Number(maxAge) > 0;
  }
  return undefined;
}
