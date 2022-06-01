/**
 * The functions here, which enrich an event with request data, are mostly for use in Node, but are safe for use in a
 * browser context. They live here in `@sentry/utils` rather than in `@sentry/node` so that they can be used in
 * frameworks (like nextjs), which, because of SSR, run the same code in both Node and browser contexts.
 *
 * TODO (v8 / #5190): Remove the note below
 * Note that for now, the tests for this code have to live in `@sentry/node`, since they test both these functions and
 * the backwards-compatibility-preserving wrappers which still live in `handlers.ts` there.
 */

/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Event, ExtractedNodeRequestData, Transaction } from '@sentry/types';
import * as cookie from 'cookie';
import * as os from 'os';
import * as url from 'url';

import { isPlainObject, isString } from './is';
import { stripUrlQueryAndFragment } from './misc';
import { normalize } from './normalize';

export interface ExpressRequest {
  baseUrl?: string;
  connection?: {
    remoteAddress?: string;
  };
  ip?: string;
  method?: string;
  originalUrl?: string;
  route?: {
    path: string;
    stack: [
      {
        name: string;
      },
    ];
  };
  query?: {
    // It can be: undefined | string | string[] | ParsedQs | ParsedQs[] (from `qs` package), but we dont want to pull it.
    [key: string]: unknown;
  };
  url?: string;
  user?: {
    [key: string]: any;
  };
}

/**
 * Sets parameterized route as transaction name e.g.: `GET /users/:id`
 * Also adds more context data on the transaction from the request
 */
export function addExpressReqToTransaction(transaction: Transaction | undefined, req: ExpressRequest): void {
  if (!transaction) return;
  transaction.name = extractExpressTransactionName(req, { path: true, method: true });
  transaction.setData('url', req.originalUrl);
  transaction.setData('baseUrl', req.baseUrl);
  transaction.setData('query', req.query);
}

/**
 * Extracts complete generalized path from the request object and uses it to construct transaction name.
 *
 * eg. GET /mountpoint/user/:id
 *
 * @param req The ExpressRequest object
 * @param options What to include in the transaction name (method, path, or both)
 *
 * @returns The fully constructed transaction name
 */
export function extractExpressTransactionName(
  req: ExpressRequest,
  options: { path?: boolean; method?: boolean } = {},
): string {
  const method = req.method && req.method.toUpperCase();

  let path = '';
  if (req.route) {
    path = `${req.baseUrl || ''}${req.route.path}`;
  } else if (req.originalUrl || req.url) {
    path = stripUrlQueryAndFragment(req.originalUrl || req.url || '');
  }

  let info = '';
  if (options.method && method) {
    info += method;
  }
  if (options.method && options.path) {
    info += ' ';
  }
  if (options.path && path) {
    info += path;
  }

  return info;
}

type TransactionNamingScheme = 'path' | 'methodPath' | 'handler';

/** JSDoc */
function extractTransaction(req: ExpressRequest, type: boolean | TransactionNamingScheme): string {
  switch (type) {
    case 'path': {
      return extractExpressTransactionName(req, { path: true });
    }
    case 'handler': {
      return (req.route && req.route && req.route.stack[0] && req.route.stack[0].name) || '<anonymous>';
    }
    case 'methodPath':
    default: {
      return extractExpressTransactionName(req, { path: true, method: true });
    }
  }
}

/** Default user keys that'll be used to extract data from the request */
const DEFAULT_USER_KEYS = ['id', 'username', 'email'];

/** JSDoc */
function extractUserData(
  user: {
    [key: string]: any;
  },
  keys: boolean | string[],
): { [key: string]: any } {
  const extractedUser: { [key: string]: any } = {};
  const attributes = Array.isArray(keys) ? keys : DEFAULT_USER_KEYS;

  attributes.forEach(key => {
    if (user && key in user) {
      extractedUser[key] = user[key];
    }
  });

  return extractedUser;
}

/** Default request keys that'll be used to extract data from the request */
const DEFAULT_REQUEST_KEYS = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];

/**
 * Normalizes data from the request object, accounting for framework differences.
 *
 * @param req The request object from which to extract data
 * @param keys An optional array of keys to include in the normalized data. Defaults to DEFAULT_REQUEST_KEYS if not
 * provided.
 * @returns An object containing normalized request data
 */
export function extractRequestData(
  req: { [key: string]: any },
  keys: string[] = DEFAULT_REQUEST_KEYS,
): ExtractedNodeRequestData {
  const requestData: { [key: string]: any } = {};

  // headers:
  //   node, express, nextjs: req.headers
  //   koa: req.header
  const headers = (req.headers || req.header || {}) as {
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
  const protocol =
    req.protocol === 'https' || req.secure || ((req.socket || {}) as { encrypted?: boolean }).encrypted
      ? 'https'
      : 'http';
  // url (including path and query string):
  //   node, express: req.originalUrl
  //   koa, nextjs: req.url
  const originalUrl = (req.originalUrl || req.url || '') as string;
  // absolute url
  const absoluteUrl = `${protocol}://${host}${originalUrl}`;

  keys.forEach(key => {
    switch (key) {
      case 'headers':
        requestData.headers = headers;
        break;
      case 'method':
        requestData.method = method;
        break;
      case 'url':
        requestData.url = absoluteUrl;
        break;
      case 'cookies':
        // cookies:
        //   node, express, koa: req.headers.cookie
        //   vercel, sails.js, express (w/ cookie middleware), nextjs: req.cookies
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.cookies = req.cookies || cookie.parse(headers.cookie || '');
        break;
      case 'query_string':
        // query string:
        //   node: req.url (raw)
        //   express, koa, nextjs: req.query
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.query_string = req.query || url.parse(originalUrl || '', false).query;
        break;
      case 'data':
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
      default:
        if ({}.hasOwnProperty.call(req, key)) {
          requestData[key] = (req as { [key: string]: any })[key];
        }
    }
  });

  return requestData;
}

/**
 * Options deciding what parts of the request to use when enhancing an event
 */
export interface ParseRequestOptions {
  ip?: boolean;
  request?: boolean | string[];
  serverName?: boolean;
  transaction?: boolean | TransactionNamingScheme;
  user?: boolean | string[];
  version?: boolean;
}

/**
 * Enriches passed event with request data.
 *
 * @param event Will be mutated and enriched with req data
 * @param req Request object
 * @param options object containing flags to enable functionality
 * @hidden
 */
export function parseRequest(event: Event, req: ExpressRequest, options?: ParseRequestOptions): Event {
  // eslint-disable-next-line no-param-reassign
  options = {
    ip: false,
    request: true,
    serverName: true,
    transaction: true,
    user: true,
    version: true,
    ...options,
  };

  if (options.version) {
    event.contexts = {
      ...event.contexts,
      runtime: {
        name: 'node',
        version: global.process.version,
      },
    };
  }

  if (options.request) {
    // if the option value is `true`, use the default set of keys by not passing anything to `extractRequestData()`
    const extractedRequestData = Array.isArray(options.request)
      ? extractRequestData(req, options.request)
      : extractRequestData(req);
    event.request = {
      ...event.request,
      ...extractedRequestData,
    };
  }

  if (options.serverName && !event.server_name) {
    event.server_name = global.process.env.SENTRY_NAME || os.hostname();
  }

  if (options.user) {
    const extractedUser = req.user && isPlainObject(req.user) ? extractUserData(req.user, options.user) : {};

    if (Object.keys(extractedUser)) {
      event.user = {
        ...event.user,
        ...extractedUser,
      };
    }
  }

  // client ip:
  //   node, nextjs: req.connection.remoteAddress
  //   express, koa: req.ip
  if (options.ip) {
    const ip = req.ip || (req.connection && req.connection.remoteAddress);
    if (ip) {
      event.user = {
        ...event.user,
        ip_address: ip,
      };
    }
  }

  if (options.transaction && !event.transaction) {
    // TODO do we even need this anymore?
    // TODO make this work for nextjs
    event.transaction = extractTransaction(req, options.transaction);
  }

  return event;
}
