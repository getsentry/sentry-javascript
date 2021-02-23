/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { captureException, getCurrentHub, startTransaction, withScope } from '@sentry/core';
import { extractSentrytraceData, extractTracestateData, Span } from '@sentry/tracing';
import { Event, ExtractedNodeRequestData, Transaction } from '@sentry/types';
import { forget, isPlainObject, isString, logger, normalize, stripUrlQueryAndFragment } from '@sentry/utils';
import * as cookie from 'cookie';
import * as domain from 'domain';
import * as http from 'http';
import * as os from 'os';
import * as url from 'url';

import { NodeClient } from './client';
import { flush } from './sdk';

const DEFAULT_SHUTDOWN_TIMEOUT = 2000;

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
 * Express-compatible tracing handler.
 * @see Exposed as `Handlers.tracingHandler`
 */
export function tracingHandler(): (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error?: any) => void,
) => void {
  return function sentryTracingMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error?: any) => void,
  ): void {
    // Extract data from trace headers
    let traceparentData, tracestateData;
    if (req.headers?.['sentry-trace']) {
      traceparentData = extractSentrytraceData(req.headers['sentry-trace'] as string);
    }
    if (req.headers?.tracestate) {
      tracestateData = extractTracestateData(req.headers.tracestate as string);
    }

    const transaction = startTransaction(
      {
        name: extractExpressTransactionName(req, { path: true, method: true }),
        op: 'http.server',
        ...traceparentData,
        metadata: { tracestate: tracestateData },
      },
      { request: extractRequestData(req) },
    );

    // We put the transaction on the scope so users can attach children to it
    getCurrentHub().configureScope(scope => {
      scope.setSpan(transaction);
    });

    // We also set __sentry_transaction on the response so people can grab the transaction there to add
    // spans to it later.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (res as any).__sentry_transaction = transaction;

    res.once('finish', () => {
      // Push `transaction.finish` to the next event loop so open spans have a chance to finish before the transaction
      // closes
      setImmediate(() => {
        addExpressReqToTransaction(transaction, req);
        transaction.setHttpStatus(res.statusCode);
        transaction.finish();
      });
    });

    next();
  };
}

/**
 * Set parameterized as transaction name e.g.: `GET /users/:id`
 * Also adds more context data on the transaction from the request
 */
function addExpressReqToTransaction(transaction: Transaction | undefined, req: ExpressRequest): void {
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
function extractExpressTransactionName(
  req: ExpressRequest,
  options: { path?: boolean; method?: boolean } = {},
): string {
  const method = req.method?.toUpperCase();

  let path = '';
  if (req.route) {
    // if the mountpoint is `/`, req.baseUrl is '' (not undefined), so it's safe to include it here
    // see https://github.com/expressjs/express/blob/508936853a6e311099c9985d4c11a4b1b8f6af07/test/req.baseUrl.js#L7
    path = `${req.baseUrl}${req.route.path}`;
  } else if (req.originalUrl || req.url) {
    path = stripUrlQueryAndFragment(req.originalUrl || req.url || '');
  }

  let info = '';
  if (options.method && method) {
    info += method;
  }
  if (options.method && options.path) {
    info += ` `;
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
      return req.route?.stack[0].name || '<anonymous>';
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
  //   node, express: req.headers
  //   koa: req.header
  const headers = (req.headers || req.header || {}) as {
    host?: string;
    cookie?: string;
  };
  // method:
  //   node, express, koa: req.method
  const method = req.method;
  // host:
  //   express: req.hostname in > 4 and req.host in < 4
  //   koa: req.host
  //   node: req.headers.host
  const host = req.hostname || req.host || headers.host || '<no host>';
  // protocol:
  //   node: <n/a>
  //   express, koa: req.protocol
  const protocol =
    req.protocol === 'https' || req.secure || ((req.socket || {}) as { encrypted?: boolean }).encrypted
      ? 'https'
      : 'http';
  // url (including path and query string):
  //   node, express: req.originalUrl
  //   koa: req.url
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
        //   vercel, sails.js, express (w/ cookie middleware): req.cookies
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.cookies = req.cookies || cookie.parse(headers.cookie || '');
        break;
      case 'query_string':
        // query string:
        //   node: req.url (raw)
        //   express, koa: req.query
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.query_string = url.parse(originalUrl || '', false).query;
        break;
      case 'data':
        if (method === 'GET' || method === 'HEAD') {
          break;
        }
        // body data:
        //   node, express, koa: req.body
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
  //   node: req.connection.remoteAddress
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
    event.transaction = extractTransaction(req, options.transaction);
  }

  return event;
}

export type RequestHandlerOptions = ParseRequestOptions & {
  flushTimeout?: number;
};

/**
 * Express compatible request handler.
 * @see Exposed as `Handlers.requestHandler`
 */
export function requestHandler(
  options?: RequestHandlerOptions,
): (req: http.IncomingMessage, res: http.ServerResponse, next: (error?: any) => void) => void {
  return function sentryRequestMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error?: any) => void,
  ): void {
    if (options && options.flushTimeout && options.flushTimeout > 0) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const _end = res.end;
      res.end = function(chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): void {
        flush(options.flushTimeout)
          .then(() => {
            _end.call(this, chunk, encoding, cb);
          })
          .then(null, e => {
            logger.error(e);
          });
      };
    }
    const local = domain.create();
    local.add(req);
    local.add(res);
    local.on('error', next);
    local.run(() => {
      getCurrentHub().configureScope(scope =>
        scope.addEventProcessor((event: Event) => parseRequest(event, req, options)),
      );
      next();
    });
  };
}

/** JSDoc */
interface MiddlewareError extends Error {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: {
    statusCode?: number | string;
  };
}

/** JSDoc */
function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || (error.output && error.output.statusCode);
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}

/**
 * Express compatible error handler.
 * @see Exposed as `Handlers.errorHandler`
 */
export function errorHandler(options?: {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(error: MiddlewareError): boolean;
}): (
  error: MiddlewareError,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error: MiddlewareError) => void,
) => void {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const shouldHandleError = (options && options.shouldHandleError) || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      withScope(_scope => {
        // For some reason we need to set the transaction on the scope again
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const transaction = (res as any).__sentry_transaction as Span;
        if (transaction && _scope.getSpan() === undefined) {
          _scope.setSpan(transaction);
        }
        const eventId = captureException(error);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (res as any).sentry = eventId;
        next(error);
      });

      return;
    }

    next(error);
  };
}

/**
 * @hidden
 */
export function logAndExitProcess(error: Error): void {
  // eslint-disable-next-line no-console
  console.error(error && error.stack ? error.stack : error);

  const client = getCurrentHub().getClient<NodeClient>();

  if (client === undefined) {
    logger.warn('No NodeClient was defined, we are exiting the process now.');
    global.process.exit(1);
    return;
  }

  const options = client.getOptions();
  const timeout =
    (options && options.shutdownTimeout && options.shutdownTimeout > 0 && options.shutdownTimeout) ||
    DEFAULT_SHUTDOWN_TIMEOUT;
  forget(
    client.close(timeout).then((result: boolean) => {
      if (!result) {
        logger.warn('We reached the timeout for emptying the request buffer, still exiting now!');
      }
      global.process.exit(1);
    }),
  );
}
