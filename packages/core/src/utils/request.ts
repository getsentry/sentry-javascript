/* eslint-disable max-lines-per-function */
import { DEBUG_BUILD } from '../debug-build';
import type { Scope } from '../scope';
import type { ResolvedDataCollection } from '../types/datacollection';
import type { PolymorphicRequest } from '../types/polymorphics';
import type { RequestEventData } from '../types/request';
import type { WebFetchHeaders, WebFetchRequest } from '../types/webfetchapi';
import { debug } from './debug-logger';
import { defaultPiiToCollectionOptions } from './data-collection/defaultPiiToCollectionOptions';
import { FILTERED_VALUE, SENSITIVE_COOKIE_NAME_SNIPPETS } from './data-collection/filtering-snippets';
import { filterKeyValueData } from './data-collection/filterKeyValueData';
import { safeUnref } from './timer';

/**
 * Maximum size of incoming HTTP request bodies attached to events.
 *
 * - `'none'`: No request bodies will be attached
 * - `'small'`: Request bodies up to 1,000 bytes will be attached
 * - `'medium'`: Request bodies up to 10,000 bytes will be attached
 * - `'always'`: Request bodies will always be attached (up to 1MB hard cap)
 */
export type MaxRequestBodySize = 'none' | 'small' | 'medium' | 'always';

/** Hard cap on captured body size, even when `maxRequestBodySize` is `'always'`. */
export const MAX_BODY_BYTE_LENGTH = 1_024 * 1_024;

/** Content types that are safe to capture as text. */
const TEXT_CONTENT_TYPES = [
  'text/',
  'application/json',
  'application/x-www-form-urlencoded',
  'application/xml',
  'application/graphql',
];

/**
 * Convert a `maxRequestBodySize` setting to a maximum byte length.
 */
export function getMaxBodyByteLength(maxRequestBodySize: Exclude<MaxRequestBodySize, 'none'>): number {
  if (maxRequestBodySize === 'small') return 1_000;
  if (maxRequestBodySize === 'medium') return 10_000;
  return MAX_BODY_BYTE_LENGTH;
}

/**
 * Transforms a `Headers` object that implements the `Web Fetch API` (https://developer.mozilla.org/en-US/docs/Web/API/Headers) into a simple key-value dict.
 * The header keys will be lower case: e.g. A "Content-Type" header will be stored as "content-type".
 */
export function winterCGHeadersToDict(winterCGHeaders: WebFetchHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    winterCGHeaders.forEach((value, key) => {
      if (typeof value === 'string') {
        // We check that value is a string even though it might be redundant to make sure prototype pollution is not possible.
        headers[key] = value;
      }
    });
  } catch {
    // just return the empty headers
  }

  return headers;
}

/**
 * Convert common request headers to a simple dictionary.
 */
export function headersToDict(
  reqHeaders: Record<string, string | string[] | undefined | number>,
): Record<string, string> {
  const headers: Record<string, string> = Object.create(null);

  try {
    Object.entries(reqHeaders).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (typeof value === 'number') {
        headers[key] = String(value);
      }
    });
  } catch {
    // just return the empty headers
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
 * Checks if the content type is textual and safe to capture.
 */
function isTextualContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const lowerContentType = contentType.toLowerCase();
  return TEXT_CONTENT_TYPES.some(type => lowerContentType.includes(type));
}

/**
 * Captures the body from a Web Fetch API Request and adds it to the isolation scope.
 *
 * This function clones the request to read the body without affecting the original.
 * Only textual content types are captured - binary data is skipped.
 *
 * This is used by WinterCG-compatible runtimes (Cloudflare Workers, Deno, Bun, Vercel Edge, etc.)
 * that use the Web Fetch API Request object.
 *
 * @param request - The incoming Web Fetch API Request
 * @param isolationScope - The isolation scope to add the body to
 * @param maxRequestBodySize - The maximum size of the request body to capture ('small' = 1KB, 'medium' = 10KB, 'always' = 1MB)
 */
export async function captureBodyFromWinterCGRequest(
  request: WebFetchRequest,
  isolationScope: Scope,
  maxRequestBodySize: Exclude<MaxRequestBodySize, 'none'>,
): Promise<void> {
  try {
    const contentType = request.headers.get('content-type');

    if (!isTextualContentType(contentType)) {
      DEBUG_BUILD && debug.log('Skipping body capture for non-textual content type:', contentType);
      return;
    }

    if (!request.body) {
      return;
    }

    const contentLength = request.headers.get('content-length');
    const maxBodySize = getMaxBodyByteLength(maxRequestBodySize);

    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!isNaN(length) && length > MAX_BODY_BYTE_LENGTH) {
        DEBUG_BUILD && debug.log('Skipping body capture: body too large', length);
        return;
      }
    }

    const clonedRequest = request.clone();
    const bodyPromise = clonedRequest.text();
    const timeoutPromise = new Promise<null>(resolve => {
      safeUnref(setTimeout(() => resolve(null), 2000));
    });

    const body = await Promise.race([bodyPromise, timeoutPromise]);

    if (body === null) {
      DEBUG_BUILD && debug.log('Timeout reading request body');
      return;
    }

    if (!body) {
      return;
    }

    // Using TextEncoder to get byte length for UTF-8 strings
    const encoder = new TextEncoder();
    const bytes = encoder.encode(body);
    const bodyByteLength = bytes.length;

    let truncatedBody: string;
    if (bodyByteLength > maxBodySize) {
      const decoder = new TextDecoder();
      truncatedBody = `${decoder.decode(bytes.slice(0, maxBodySize - 3))}...`;
    } else {
      truncatedBody = body;
    }

    isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: truncatedBody } });

    DEBUG_BUILD && debug.log('Captured request body:', bodyByteLength, 'bytes');
  } catch (error) {
    DEBUG_BUILD && debug.error('Error capturing request body:', error);
  }
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

  // Check for x-forwarded-host first, then fall back to host header
  const forwardedHost = typeof headers['x-forwarded-host'] === 'string' ? headers['x-forwarded-host'] : undefined;
  const host = forwardedHost || (typeof headers.host === 'string' ? headers.host : undefined);

  // Check for x-forwarded-proto first, then fall back to existing protocol detection
  const forwardedProto = typeof headers['x-forwarded-proto'] === 'string' ? headers['x-forwarded-proto'] : undefined;
  const protocol = forwardedProto || request.protocol || (request.socket?.encrypted ? 'https' : 'http');

  const url = request.url || '';

  const absoluteUrl = getAbsoluteUrl({
    url,
    host,
    protocol,
  });

  // This is non-standard, but may be sometimes set
  // It may be overwritten later by our own body handling
  const data = (request as PolymorphicRequest).body || undefined;

  // This is non-standard, but may be set on e.g. Next.js or Express requests
  const cookies = (request as PolymorphicRequest).cookies;

  return {
    url: absoluteUrl,
    method: request.method,
    query_string: extractQueryParamsFromUrl(url),
    headers: headersToDict(headers),
    cookies,
    data,
  };
}

function getAbsoluteUrl({
  url,
  protocol,
  host,
}: {
  url?: string;
  protocol: string;
  host?: string;
}): string | undefined {
  if (url?.startsWith('http')) {
    return url;
  }

  if (url && host) {
    return `${protocol}://${host}${url}`;
  }

  return undefined;
}

/**
 * Converts incoming HTTP request or response headers to OpenTelemetry span attributes following semantic conventions.
 * Header names are converted to the format: http.<request|response>.header.<key>
 * where <key> is the header name in lowercase with dashes converted to underscores.
 *
 * @param lifecycle - The lifecycle of the headers, either 'request' or 'response'
 *
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/http/#http-request-header
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/http/#http-response-header
 *
 * @see https://getsentry.github.io/sentry-conventions/attributes/http/#http-request-header-key
 * @see https://getsentry.github.io/sentry-conventions/attributes/http/#http-response-header-key
 */
export function httpHeadersToSpanAttributes(
  headers: Record<string, string | string[] | undefined>,
  // TODO(v11): Remove boolean support once sendDefaultPii is fully removed.
  // Internally, always pass ResolvedDataCollection from client.getDataCollectionOptions().
  dataCollection: ResolvedDataCollection | boolean = false,
  lifecycle: 'request' | 'response' = 'request',
): Record<string, string> {
  const resolvedDataCollection =
    typeof dataCollection === 'boolean' ? defaultPiiToCollectionOptions(dataCollection) : dataCollection;

  const headerBehavior =
    lifecycle === 'request' ? resolvedDataCollection.httpHeaders.request : resolvedDataCollection.httpHeaders.response;
  const cookieBehavior = resolvedDataCollection.cookies;
  const prefix = `http.${lifecycle}.header.`;

  const spanAttributes: Record<string, string> = {};

  try {
    const regularHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (value == null) {
        continue;
      }

      const lowerKey = key.toLowerCase();
      const isCookieHeader = lowerKey === 'cookie' || lowerKey === 'set-cookie';

      if (isCookieHeader) {
        if (cookieBehavior === false) {
          continue;
        }

        if (typeof value === 'string' && value !== '') {
          const parsed = parseCookieHeader(value, lowerKey === 'set-cookie');
          const filtered = filterKeyValueData(parsed, cookieBehavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
          for (const [cookieKey, cookieValue] of Object.entries(filtered)) {
            spanAttributes[`${prefix}${normalizeAttributeKey(lowerKey)}.${normalizeAttributeKey(cookieKey)}`] =
              cookieValue;
          }
        } else {
          spanAttributes[`${prefix}${normalizeAttributeKey(lowerKey)}`] = FILTERED_VALUE;
        }
      } else {
        if (headerBehavior === false) {
          continue;
        }

        if (Array.isArray(value)) {
          regularHeaders[lowerKey] = value.map(v => (v != null ? String(v) : v)).join(';');
        } else if (typeof value === 'string') {
          regularHeaders[lowerKey] = value;
        }
      }
    }

    if (headerBehavior !== false) {
      const filtered = filterKeyValueData(regularHeaders, headerBehavior);
      for (const [headerKey, headerValue] of Object.entries(filtered)) {
        spanAttributes[`${prefix}${normalizeAttributeKey(headerKey)}`] = headerValue;
      }
    }
  } catch {
    // Return empty object if there's an error
  }

  return spanAttributes;
}

function normalizeAttributeKey(key: string): string {
  return key.replace(/-/g, '_');
}

function parseCookieHeader(value: string, isSetCookie: boolean): Record<string, string> {
  // Set-Cookie: single cookie with attributes ("name=value; HttpOnly; Secure")
  // Cookie: multiple cookies separated by "; " ("cookie1=value1; cookie2=value2")
  const semicolonIndex = value.indexOf(';');
  const cookieString = isSetCookie && semicolonIndex !== -1 ? value.substring(0, semicolonIndex) : value;
  const cookies = isSetCookie ? [cookieString] : cookieString.split('; ');

  const result: Record<string, string> = {};
  for (const cookie of cookies) {
    const equalSignIndex = cookie.indexOf('=');
    const cookieKey = (equalSignIndex !== -1 ? cookie.substring(0, equalSignIndex) : cookie).toLowerCase();
    const cookieValue = equalSignIndex !== -1 ? cookie.substring(equalSignIndex + 1) : '';
    result[cookieKey] = cookieValue;
  }
  return result;
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
    const queryParams = new URL(url, 'http://s.io').search.slice(1);
    return queryParams.length ? queryParams : undefined;
  } catch {
    return undefined;
  }
}
