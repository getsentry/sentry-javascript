/* eslint-disable max-lines */
import type {
  Event,
  ExtractedNodeRequestData,
  PolymorphicRequest,
  Request,
  TransactionSource,
  WebFetchHeaders,
  WebFetchRequest,
} from '@sentry/types';

import { parseCookie } from './cookie';
import { DEBUG_BUILD } from './debug-build';
import { isPlainObject, isString } from './is';
import { logger } from './logger';
import { normalize } from './normalize';
import { truncate } from './string';
import { stripUrlQueryAndFragment } from './url';
import { getClientIPAddress, ipHeaderNames } from './vendor/getIpAddress';

const DEFAULT_INCLUDES = {
  ip: false,
  request: true,
  transaction: true,
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
    transaction?: boolean | TransactionNamingScheme;
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

export type TransactionNamingScheme = 'path' | 'methodPath' | 'handler';

/**
 * Extracts a complete and parameterized path from the request object and uses it to construct transaction name.
 * If the parameterized transaction name cannot be extracted, we fall back to the raw URL.
 *
 * Additionally, this function determines and returns the transaction name source
 *
 * eg. GET /mountpoint/user/:id
 *
 * @param req A request object
 * @param options What to include in the transaction name (method, path, or a custom route name to be
 *                used instead of the request's route)
 *
 * @returns A tuple of the fully constructed transaction name [0] and its source [1] (can be either 'route' or 'url')
 */
export function extractPathForTransaction(
  req: PolymorphicRequest,
  options: { path?: boolean; method?: boolean; customRoute?: string } = {},
): [string, TransactionSource] {
  const method = req.method && req.method.toUpperCase();

  let path = '';
  let source: TransactionSource = 'url';

  // Check to see if there's a parameterized route we can use (as there is in Express)
  if (options.customRoute || req.route) {
    path = options.customRoute || `${req.baseUrl || ''}${req.route && req.route.path}`;
    source = 'route';
  }

  // Otherwise, just take the original URL
  else if (req.originalUrl || req.url) {
    path = stripUrlQueryAndFragment(req.originalUrl || req.url || '');
  }

  let name = '';
  if (options.method && method) {
    name += method;
  }
  if (options.method && options.path) {
    name += ' ';
  }
  if (options.path && path) {
    name += path;
  }

  return [name, source];
}

function extractTransaction(req: PolymorphicRequest, type: boolean | TransactionNamingScheme): string {
  switch (type) {
    case 'path': {
      return extractPathForTransaction(req, { path: true })[0];
    }
    case 'handler': {
      return (req.route && req.route.stack && req.route.stack[0] && req.route.stack[0].name) || '<anonymous>';
    }
    case 'methodPath':
    default: {
      // if exist _reconstructedRoute return that path instead of route.path
      const customRoute = req._reconstructedRoute ? req._reconstructedRoute : undefined;
      return extractPathForTransaction(req, { path: true, method: true, customRoute })[0];
    }
  }
}

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
 * Normalize data from the request object, accounting for framework differences.
 *
 * @param req The request object from which to extract data
 * @param options.include An optional array of keys to include in the normalized data. Defaults to
 * DEFAULT_REQUEST_INCLUDES if not provided.
 * @param options.deps Injected, platform-specific dependencies
 * @returns An object containing normalized request data
 */
export function extractRequestData(
  req: PolymorphicRequest,
  options: {
    include?: string[];
  } = {},
): ExtractedNodeRequestData {
  const { include = DEFAULT_REQUEST_INCLUDES } = options;
  const requestData: { [key: string]: unknown } = {};

  // headers:
  //   node, express, koa, nextjs: req.headers
  const headers = (req.headers || {}) as typeof req.headers & {
    host?: string;
    cookie?: string;
  };
  // method:
  //   node, express, koa, nextjs: req.method
  const method = req.method;
  // host:
  //   express: req.hostname in > 4 and req.host in < 4
  //   koa: req.host
  //   node, nextjs: req.headers.host
  // Express 4 mistakenly strips off port number from req.host / req.hostname so we can't rely on them
  // See: https://github.com/expressjs/express/issues/3047#issuecomment-236653223
  // Also: https://github.com/getsentry/sentry-javascript/issues/1917
  const host = headers.host || req.hostname || req.host || '<no host>';
  // protocol:
  //   node, nextjs: <n/a>
  //   express, koa: req.protocol
  const protocol = req.protocol === 'https' || (req.socket && req.socket.encrypted) ? 'https' : 'http';
  // url (including path and query string):
  //   node, express: req.originalUrl
  //   koa, nextjs: req.url
  const originalUrl = req.originalUrl || req.url || '';
  // absolute url
  const absoluteUrl = originalUrl.startsWith(protocol) ? originalUrl : `${protocol}://${host}${originalUrl}`;
  include.forEach(key => {
    switch (key) {
      case 'headers': {
        requestData.headers = headers;

        // Remove the Cookie header in case cookie data should not be included in the event
        if (!include.includes('cookies')) {
          delete (requestData.headers as { cookie?: string }).cookie;
        }

        // Remove IP headers in case IP data should not be included in the event
        if (!include.includes('ip')) {
          ipHeaderNames.forEach(ipHeaderName => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete (requestData.headers as Record<string, unknown>)[ipHeaderName];
          });
        }

        break;
      }
      case 'method': {
        requestData.method = method;
        break;
      }
      case 'url': {
        requestData.url = absoluteUrl;
        break;
      }
      case 'cookies': {
        // cookies:
        //   node, express, koa: req.headers.cookie
        //   vercel, sails.js, express (w/ cookie middleware), nextjs: req.cookies
        requestData.cookies =
          // TODO (v8 / #5257): We're only sending the empty object for backwards compatibility, so the last bit can
          // come off in v8
          req.cookies || (headers.cookie && parseCookie(headers.cookie)) || {};
        break;
      }
      case 'query_string': {
        // query string:
        //   node: req.url (raw)
        //   express, koa, nextjs: req.query
        requestData.query_string = extractQueryParams(req);
        break;
      }
      case 'data': {
        if (method === 'GET' || method === 'HEAD') {
          break;
        }
        // NOTE: As of v8, request is (unless a user sets this manually) ALWAYS a http request
        // Which does not have a body by default
        // However, in our http instrumentation, we patch the request to capture the body and store it on the
        // request as `.body` anyhow
        // In v9, we may update requestData to only work with plain http requests
        // body data:
        //   express, koa, nextjs: req.body
        //
        //   when using node by itself, you have to read the incoming stream(see
        //   https://nodejs.dev/learn/get-http-request-body-data-using-nodejs); if a user is doing that, we can't know
        //   where they're going to store the final result, so they'll have to capture this data themselves
        const body = req.body;
        if (body !== undefined) {
          const stringBody: string = isString(body)
            ? body
            : isPlainObject(body)
              ? JSON.stringify(normalize(body))
              : truncate(`${body}`, 1024);
          if (stringBody) {
            requestData.data = stringBody;
          }
        }
        break;
      }
      default: {
        if ({}.hasOwnProperty.call(req, key)) {
          requestData[key] = (req as { [key: string]: unknown })[key];
        }
      }
    }
  });

  return requestData;
}

/**
 * Add already normalized request data to an event.
 * This mutates the passed in event.
 */
export function addNormalizedRequestDataToEvent(
  event: Event,
  req: Request,
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
        ...event.user,
        ...extractedUser,
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
 * Add data from the given request to the given event
 *
 * @param event The event to which the request data will be added
 * @param req Request object
 * @param options.include Flags to control what data is included
 * @param options.deps Injected platform-specific dependencies
 * @returns The mutated `Event` object
 */
export function addRequestDataToEvent(
  event: Event,
  req: PolymorphicRequest,
  options?: AddRequestDataToEventOptions,
): Event {
  const include = {
    ...DEFAULT_INCLUDES,
    ...(options && options.include),
  };

  if (include.request) {
    const includeRequest = Array.isArray(include.request) ? [...include.request] : [...DEFAULT_REQUEST_INCLUDES];
    if (include.ip) {
      includeRequest.push('ip');
    }

    const extractedRequestData = extractRequestData(req, { include: includeRequest });

    event.request = {
      ...event.request,
      ...extractedRequestData,
    };
  }

  if (include.user) {
    const extractedUser = req.user && isPlainObject(req.user) ? extractUserData(req.user, include.user) : {};

    if (Object.keys(extractedUser).length) {
      event.user = {
        ...event.user,
        ...extractedUser,
      };
    }
  }

  // client ip:
  //   node, nextjs: req.socket.remoteAddress
  //   express, koa: req.ip
  //   It may also be sent by proxies as specified in X-Forwarded-For or similar headers
  if (include.ip) {
    const ip = (req.headers && getClientIPAddress(req.headers)) || req.ip || (req.socket && req.socket.remoteAddress);
    if (ip) {
      event.user = {
        ...event.user,
        ip_address: ip,
      };
    }
  }

  if (include.transaction && !event.transaction && event.type === 'transaction') {
    // TODO do we even need this anymore?
    // TODO make this work for nextjs
    event.transaction = extractTransaction(req, include.transaction);
  }

  return event;
}

function extractQueryParams(req: PolymorphicRequest): string | Record<string, unknown> | undefined {
  // url (including path and query string):
  //   node, express: req.originalUrl
  //   koa, nextjs: req.url
  let originalUrl = req.originalUrl || req.url || '';

  if (!originalUrl) {
    return;
  }

  // The `URL` constructor can't handle internal URLs of the form `/some/path/here`, so stick a dummy protocol and
  // hostname on the beginning. Since the point here is just to grab the query string, it doesn't matter what we use.
  if (originalUrl.startsWith('/')) {
    originalUrl = `http://dogs.are.great${originalUrl}`;
  }

  try {
    const queryParams = req.query || new URL(originalUrl).search.slice(1);
    return queryParams.length ? queryParams : undefined;
  } catch {
    return undefined;
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
 * Converts a `Request` object that implements the `Web Fetch API` (https://developer.mozilla.org/en-US/docs/Web/API/Headers) into the format that the `RequestData` integration understands.
 */
export function winterCGRequestToRequestData(req: WebFetchRequest): PolymorphicRequest {
  const headers = winterCGHeadersToDict(req.headers);
  return {
    method: req.method,
    url: req.url,
    headers,
  };
}

function extractNormalizedRequestData(normalizedRequest: Request, { include }: { include: string[] }): Request {
  const includeKeys = include ? (Array.isArray(include) ? include : DEFAULT_REQUEST_INCLUDES) : [];

  const requestData: Request = {};

  const { headers } = normalizedRequest;

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
