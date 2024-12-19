import type { PolymorphicRequest, RequestEventData, WebFetchHeaders, WebFetchRequest } from '../types-hoist';
import { DEBUG_BUILD } from './debug-build';
import { logger } from './logger';
import { dropUndefinedKeys } from './object';

/**
 * Transforms a `Headers` object that implements the `Web Fetch API` (https://developer.mozilla.org/en-US/docs/Web/API/Headers) into a simple key-value dict.
 * The header keys will be lower case: e.g. A "Content-Type" header will be stored as "content-type".
 */
// TODO(v8): Make this function return undefined when the extraction fails.
export function winterCGHeadersToDict(winterCGHeaders: WebFetchHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    winterCGHeaders.forEach((value, key) => {
      if (typeof value === 'string') {
        // We check that value is a string even though it might be redundant to make sure prototype pollution is not possible.
        headers[key] = value;
      }
    });
  } catch (e) {
    DEBUG_BUILD &&
      logger.warn('Sentry failed extracting headers from a request object. If you see this, please file an issue.');
  }

  return headers;
}

/**
 * Convert common request headers to a simple dictionary.
 */
export function headersToDict(reqHeaders: Record<string, string | string[] | undefined>): Record<string, string> {
  const headers: Record<string, string> = Object.create(null);

  try {
    Object.entries(reqHeaders).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  } catch (e) {
    DEBUG_BUILD &&
      logger.warn('Sentry failed extracting headers from a request object. If you see this, please file an issue.');
  }

  return headers;
}

/**
 * Converts a `Request` object that implements the `Web Fetch API` (https://developer.mozilla.org/en-US/docs/Web/API/Headers) into the format that the `RequestData` integration understands.
 */
export function winterCGRequestToRequestData(req: WebFetchRequest): RequestEventData {
  const headers = winterCGHeadersToDict(req.headers);

  return {
    method: req.method,
    url: req.url,
    query_string: extractQueryParamsFromUrl(req.url),
    headers,
    // TODO: Can we extract body data from the request?
  };
}

/**
 * Convert a HTTP request object to RequestEventData to be passed as normalizedRequest.
 * Instead of allowing `PolymorphicRequest` to be passed,
 * we want to be more specific and generally require a http.IncomingMessage-like object.
 */
export function httpRequestToRequestData(request: {
  method?: string;
  url?: string;
  headers?: {
    [key: string]: string | string[] | undefined;
  };
  protocol?: string;
  socket?: {
    encrypted?: boolean;
    remoteAddress?: string;
  };
}): RequestEventData {
  const headers = request.headers || {};
  const host = headers.host || '<no host>';
  const protocol = request.socket && request.socket.encrypted ? 'https' : 'http';
  const originalUrl = request.url || '';
  const absoluteUrl = originalUrl.startsWith(protocol) ? originalUrl : `${protocol}://${host}${originalUrl}`;

  // This is non-standard, but may be sometimes set
  // It may be overwritten later by our own body handling
  const data = (request as PolymorphicRequest).body || undefined;

  // This is non-standard, but may be set on e.g. Next.js or Express requests
  const cookies = (request as PolymorphicRequest).cookies;

  return dropUndefinedKeys({
    url: absoluteUrl,
    method: request.method,
    query_string: extractQueryParamsFromUrl(originalUrl),
    headers: headersToDict(headers),
    cookies,
    data,
  });
}

/** Extract the query params from an URL. */
export function extractQueryParamsFromUrl(url: string): string | undefined {
  // url is path and query string
  if (!url) {
    return;
  }

  try {
    // The `URL` constructor can't handle internal URLs of the form `/some/path/here`, so stick a dummy protocol and
    // hostname as the base. Since the point here is just to grab the query string, it doesn't matter what we use.
    const queryParams = new URL(url, 'http://dogs.are.great').search.slice(1);
    return queryParams.length ? queryParams : undefined;
  } catch {
    return undefined;
  }
}
