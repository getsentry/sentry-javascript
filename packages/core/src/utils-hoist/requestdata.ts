import type { Event, PolymorphicRequest, RequestEventData, WebFetchHeaders, WebFetchRequest } from '../types-hoist';

import { parseCookie } from './cookie';
import { DEBUG_BUILD } from './debug-build';
import { isPlainObject } from './is';
import { logger } from './logger';
import { dropUndefinedKeys } from './object';
import { getClientIPAddress, ipHeaderNames } from './vendor/getIpAddress';

const DEFAULT_INCLUDES = {
  ip: false,
  request: true,
  user: true,
};
const DEFAULT_REQUEST_INCLUDES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];
export const DEFAULT_USER_INCLUDES = ['id', 'username', 'email'];

/**
 * Options deciding what parts of the request to use when enhancing an event
 */
export type AddRequestDataToEventOptions = {
  /** Flags controlling whether each type of data should be added to the event */
  include?: {
    ip?: boolean;
    request?: boolean | Array<(typeof DEFAULT_REQUEST_INCLUDES)[number]>;
    user?: boolean | Array<(typeof DEFAULT_USER_INCLUDES)[number]>;
  };

  /** Injected platform-specific dependencies */
  deps?: {
    cookie: {
      parse: (cookieStr: string) => Record<string, string>;
    };
    url: {
      parse: (urlStr: string) => {
        query: string | null;
      };
    };
  };
};

function extractUserData(
  user: {
    [key: string]: unknown;
  },
  keys: boolean | string[],
): { [key: string]: unknown } {
  const extractedUser: { [key: string]: unknown } = {};
  const attributes = Array.isArray(keys) ? keys : DEFAULT_USER_INCLUDES;

  attributes.forEach(key => {
    if (user && key in user) {
      extractedUser[key] = user[key];
    }
  });

  return extractedUser;
}

/**
 * Add already normalized request data to an event.
 * This mutates the passed in event.
 */
export function addNormalizedRequestDataToEvent(
  event: Event,
  req: RequestEventData,
  // This is non-standard data that is not part of the regular HTTP request
  additionalData: { ipAddress?: string; user?: Record<string, unknown> },
  options: AddRequestDataToEventOptions,
): void {
  const include = {
    ...DEFAULT_INCLUDES,
    ...(options && options.include),
  };

  if (include.request) {
    const includeRequest = Array.isArray(include.request) ? [...include.request] : [...DEFAULT_REQUEST_INCLUDES];
    if (include.ip) {
      includeRequest.push('ip');
    }

    const extractedRequestData = extractNormalizedRequestData(req, { include: includeRequest });

    event.request = {
      ...event.request,
      ...extractedRequestData,
    };
  }

  if (include.user) {
    const extractedUser =
      additionalData.user && isPlainObject(additionalData.user)
        ? extractUserData(additionalData.user, include.user)
        : {};

    if (Object.keys(extractedUser).length) {
      event.user = {
        ...extractedUser,
        ...event.user,
      };
    }
  }

  if (include.ip) {
    const ip = (req.headers && getClientIPAddress(req.headers)) || additionalData.ipAddress;
    if (ip) {
      event.user = {
        ...event.user,
        ip_address: ip,
      };
    }
  }
}

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
  socket?: unknown;
}): RequestEventData {
  const headers = request.headers || {};
  const host = headers.host || '<no host>';
  const protocol = request.socket && (request.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
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

function extractNormalizedRequestData(
  normalizedRequest: RequestEventData,
  { include }: { include: string[] },
): RequestEventData {
  const includeKeys = include ? (Array.isArray(include) ? include : DEFAULT_REQUEST_INCLUDES) : [];

  const requestData: RequestEventData = {};
  const headers = { ...normalizedRequest.headers };

  if (includeKeys.includes('headers')) {
    requestData.headers = headers;

    // Remove the Cookie header in case cookie data should not be included in the event
    if (!include.includes('cookies')) {
      delete (headers as { cookie?: string }).cookie;
    }

    // Remove IP headers in case IP data should not be included in the event
    if (!include.includes('ip')) {
      ipHeaderNames.forEach(ipHeaderName => {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (headers as Record<string, unknown>)[ipHeaderName];
      });
    }
  }

  if (includeKeys.includes('method')) {
    requestData.method = normalizedRequest.method;
  }

  if (includeKeys.includes('url')) {
    requestData.url = normalizedRequest.url;
  }

  if (includeKeys.includes('cookies')) {
    const cookies = normalizedRequest.cookies || (headers && headers.cookie ? parseCookie(headers.cookie) : undefined);
    requestData.cookies = cookies || {};
  }

  if (includeKeys.includes('query_string')) {
    requestData.query_string = normalizedRequest.query_string;
  }

  if (includeKeys.includes('data')) {
    requestData.data = normalizedRequest.data;
  }

  return requestData;
}
