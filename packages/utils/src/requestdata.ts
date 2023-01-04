// TODO: Remove this file once equivalent integration is used everywhere

/* eslint-disable complexity */
/**
 * The functions here, which enrich an event with request data, are mostly for use in Node, but are safe for use in a
 * browser context. They live here in `@sentry/utils` rather than in `@sentry/node` so that they can be used in
 * frameworks (like nextjs), which, because of SSR, run the same code in both Node and browser contexts.
 *
 * TODO (v8 / #5257): Remove the note below
 * Note that for now, the tests for this code have to live in `@sentry/node`, since they test both these functions and
 * the backwards-compatibility-preserving wrappers which still live in `handlers.ts` there.
 */

/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Event,
  ExtractedNodeRequestData,
  PolymorphicRequest,
  Transaction,
  TransactionSource,
} from '@sentry/types';

import { isPlainObject, isString } from './is';
import { normalize } from './normalize';
import { stripUrlQueryAndFragment } from './url';

const DEFAULT_INCLUDES = {
  ip: false,
  request: true,
  transaction: true,
  user: true,
};
const DEFAULT_REQUEST_INCLUDES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];
const DEFAULT_USER_INCLUDES = ['id', 'username', 'email'];

type InjectedNodeDeps = {
  cookie: {
    parse: (cookieStr: string) => Record<string, string>;
  };
  url: {
    parse: (urlStr: string) => {
      query: string | null;
    };
  };
};

/**
 * Sets parameterized route as transaction name e.g.: `GET /users/:id`
 * Also adds more context data on the transaction from the request
 */
export function addRequestDataToTransaction(
  transaction: Transaction | undefined,
  req: PolymorphicRequest,
  deps?: InjectedNodeDeps,
): void {
  if (!transaction) return;
  if (!transaction.metadata.source || transaction.metadata.source === 'url') {
    // Attempt to grab a parameterized route off of the request
    transaction.setName(...extractPathForTransaction(req, { path: true, method: true }));
  }
  transaction.setData('url', req.originalUrl || req.url);
  if (req.baseUrl) {
    transaction.setData('baseUrl', req.baseUrl);
  }
  transaction.setData('query', extractQueryParams(req, deps));
}

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

type TransactionNamingScheme = 'path' | 'methodPath' | 'handler';

/** JSDoc */
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
      return extractPathForTransaction(req, { path: true, method: true })[0];
    }
  }
}

/** JSDoc */
function extractUserData(
  user: {
    [key: string]: any;
  },
  keys: boolean | string[],
): { [key: string]: any } {
  const extractedUser: { [key: string]: any } = {};
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
  options?: {
    include?: string[];
    deps?: InjectedNodeDeps;
  },
): ExtractedNodeRequestData {
  const { include = DEFAULT_REQUEST_INCLUDES, deps } = options || {};
  const requestData: { [key: string]: any } = {};

  // headers:
  //   node, express, koa, nextjs: req.headers
  const headers = (req.headers || {}) as {
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
  const host = req.hostname || req.host || headers.host || '<no host>';
  // protocol:
  //   node, nextjs: <n/a>
  //   express, koa: req.protocol
  const protocol = req.protocol === 'https' || (req.socket && req.socket.encrypted) ? 'https' : 'http';
  // url (including path and query string):
  //   node, express: req.originalUrl
  //   koa, nextjs: req.url
  const originalUrl = req.originalUrl || req.url || '';
  // absolute url
  const absoluteUrl = `${protocol}://${host}${originalUrl}`;
  include.forEach(key => {
    switch (key) {
      case 'headers': {
        requestData.headers = headers;
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.cookies =
          // TODO (v8 / #5257): We're only sending the empty object for backwards compatibility, so the last bit can
          // come off in v8
          req.cookies || (headers.cookie && deps && deps.cookie && deps.cookie.parse(headers.cookie)) || {};
        break;
      }
      case 'query_string': {
        // query string:
        //   node: req.url (raw)
        //   express, koa, nextjs: req.query
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.query_string = extractQueryParams(req, deps);
        break;
      }
      case 'data': {
        if (method === 'GET' || method === 'HEAD') {
          break;
        }
        // body data:
        //   express, koa, nextjs: req.body
        //
        //   when using node by itself, you have to read the incoming stream(see
        //   https://nodejs.dev/learn/get-http-request-body-data-using-nodejs); if a user is doing that, we can't know
        //   where they're going to store the final result, so they'll have to capture this data themselves
        if (req.body !== undefined) {
          requestData.data = isString(req.body) ? req.body : JSON.stringify(normalize(req.body));
        }
        break;
      }
      default: {
        if ({}.hasOwnProperty.call(req, key)) {
          requestData[key] = (req as { [key: string]: any })[key];
        }
      }
    }
  });

  return requestData;
}

/**
 * Options deciding what parts of the request to use when enhancing an event
 */
export interface AddRequestDataToEventOptions {
  /** Flags controlling whether each type of data should be added to the event */
  include?: {
    ip?: boolean;
    request?: boolean | string[];
    transaction?: boolean | TransactionNamingScheme;
    user?: boolean | string[];
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
}

/**
 * Add data from the given request to the given event
 *
 * @param event The event to which the request data will be added
 * @param req Request object
 * @param options.include Flags to control what data is included
 * @param options.deps Injected platform-specific dependencies
 * @hidden
 */
export function addRequestDataToEvent(
  event: Event,
  req: PolymorphicRequest,
  options?: AddRequestDataToEventOptions,
): Event {
  const include = {
    ...DEFAULT_INCLUDES,
    ...options?.include,
  };

  if (include.request) {
    const extractedRequestData = Array.isArray(include.request)
      ? extractRequestData(req, { include: include.request, deps: options?.deps })
      : extractRequestData(req, { deps: options?.deps });

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
  if (include.ip) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress);
    if (ip) {
      event.user = {
        ...event.user,
        ip_address: ip,
      };
    }
  }

  if (include.transaction && !event.transaction) {
    // TODO do we even need this anymore?
    // TODO make this work for nextjs
    event.transaction = extractTransaction(req, include.transaction);
  }

  return event;
}

function extractQueryParams(
  req: PolymorphicRequest,
  deps?: InjectedNodeDeps,
): string | Record<string, unknown> | undefined {
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

  return (
    req.query ||
    (typeof URL !== undefined && new URL(originalUrl).search.replace('?', '')) ||
    // In Node 8, `URL` isn't in the global scope, so we have to use the built-in module from Node
    (deps && deps.url && deps.url.parse(originalUrl).query) ||
    undefined
  );
}
