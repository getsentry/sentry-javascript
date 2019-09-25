import { captureException, getCurrentHub, withScope } from '@sentry/core';
import { Span } from '@sentry/hub';
import { Event } from '@sentry/types';
import { forget, isString, logger, normalize } from '@sentry/utils';
import * as cookie from 'cookie';
import * as domain from 'domain';
import * as http from 'http';
import * as os from 'os';
import * as url from 'url';

import { NodeClient } from './client';
import { flush } from './sdk';

const DEFAULT_SHUTDOWN_TIMEOUT = 2000;

type TransactionTypes = 'path' | 'methodPath' | 'handler';

/** JSDoc */
function extractTransaction(req: { [key: string]: any }, type: boolean | TransactionTypes): string | undefined {
  try {
    // Express.js shape
    const request = req as {
      method: string;
      route: {
        path: string;
        stack: [
          {
            name: string;
          }
        ];
      };
    };

    switch (type) {
      case 'path': {
        return request.route.path;
      }
      case 'handler': {
        return request.route.stack[0].name;
      }
      case 'methodPath':
      default: {
        const method = request.method.toUpperCase();
        const path = request.route.path;
        return `${method}|${path}`;
      }
    }
  } catch (_oO) {
    return undefined;
  }
}

/** Default request keys that'll be used to extract data from the request */
const DEFAULT_REQUEST_KEYS = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];

/** JSDoc */
function extractRequestData(req: { [key: string]: any }, keys: boolean | string[]): { [key: string]: string } {
  const request: { [key: string]: any } = {};
  const attributes = Array.isArray(keys) ? keys : DEFAULT_REQUEST_KEYS;

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
  const originalUrl = (req.originalUrl || req.url) as string;
  // absolute url
  const absoluteUrl = `${protocol}://${host}${originalUrl}`;

  attributes.forEach(key => {
    switch (key) {
      case 'headers':
        request.headers = headers;
        break;
      case 'method':
        request.method = method;
        break;
      case 'url':
        request.url = absoluteUrl;
        break;
      case 'cookies':
        // cookies:
        //   node, express, koa: req.headers.cookie
        request.cookies = cookie.parse(headers.cookie || '');
        break;
      case 'query_string':
        // query string:
        //   node: req.url (raw)
        //   express, koa: req.query
        request.query_string = url.parse(originalUrl || '', false).query;
        break;
      case 'data':
        // body data:
        //   node, express, koa: req.body
        let data = req.body;
        if (method === 'GET' || method === 'HEAD') {
          if (typeof data === 'undefined') {
            data = '<unavailable>';
          }
        }
        if (data && !isString(data)) {
          // Make sure the request body is a string
          data = JSON.stringify(normalize(data));
        }
        request.data = data;
        break;
      default:
        if ({}.hasOwnProperty.call(req, key)) {
          request[key] = (req as { [key: string]: any })[key];
        }
    }
  });

  return request;
}

/** Default user keys that'll be used to extract data from the request */
const DEFAULT_USER_KEYS = ['id', 'username', 'email'];

/** JSDoc */
function extractUserData(req: { [key: string]: any }, keys: boolean | string[]): { [key: string]: string } {
  const user: { [key: string]: string } = {};
  const attributes = Array.isArray(keys) ? keys : DEFAULT_USER_KEYS;

  attributes.forEach(key => {
    if (key in req.user) {
      user[key] = (req.user as { [key: string]: string })[key];
    }
  });

  // client ip:
  //   node: req.connection.remoteAddress
  //   express, koa: req.ip
  const ip =
    req.ip ||
    (req.connection &&
      (req.connection as {
        remoteAddress?: string;
      }).remoteAddress);

  if (ip) {
    user.ip_address = ip as string;
  }

  return user;
}

/**
 * Enriches passed event with request data.
 *
 *
 * @param event Will be mutated and enriched with req data
 * @param req Request object
 * @param options object containing flags to enable functionality
 * @hidden
 */
export function parseRequest(
  event: Event,
  req: {
    [key: string]: any;
  },
  options?: {
    request?: boolean | string[];
    serverName?: boolean;
    transaction?: boolean | TransactionTypes;
    user?: boolean | string[];
    version?: boolean;
  },
): Event {
  // tslint:disable-next-line:no-parameter-reassignment
  options = {
    request: true,
    serverName: true,
    transaction: true,
    user: true,
    version: true,
    ...options,
  };

  if (options.version) {
    event.extra = {
      ...event.extra,
      node: global.process.version,
    };
  }

  if (options.request) {
    event.request = {
      ...event.request,
      ...extractRequestData(req, options.request),
    };
  }

  if (options.serverName) {
    event.server_name = global.process.env.SENTRY_NAME || os.hostname();
  }

  if (options.user && req.user) {
    event.user = {
      ...event.user,
      ...extractUserData(req, options.user),
    };
  }

  if (options.transaction && !event.transaction) {
    const transaction = extractTransaction(req, options.transaction);
    if (transaction) {
      event.transaction = transaction;
    }
  }

  return event;
}

/**
 * Express compatible request handler.
 * @see Exposed as `Handlers.requestHandler`
 */
export function requestHandler(options?: {
  request?: boolean;
  serverName?: boolean;
  transaction?: boolean | TransactionTypes;
  user?: boolean | string[];
  version?: boolean;
  flushTimeout?: number;
}): (req: http.IncomingMessage, res: http.ServerResponse, next: (error?: any) => void) => void {
  return function sentryRequestMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error?: any) => void,
  ): void {
    if (options && options.flushTimeout && options.flushTimeout > 0) {
      // tslint:disable-next-line: no-unbound-method
      const _end = res.end;
      res.end = function(chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): void {
        flush(options.flushTimeout)
          .then(() => {
            _end.call(this, chunk, encoding, cb);
          })
          .catch(e => {
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
    _res: http.ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    const shouldHandleError = (options && options.shouldHandleError) || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      withScope(scope => {
        if (_req.headers && isString(_req.headers['sentry-trace'])) {
          const span = Span.fromTraceparent(_req.headers['sentry-trace'] as string);
          scope.setSpan(span);
        }
        const eventId = captureException(error);
        (_res as any).sentry = eventId;
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
export function defaultOnFatalError(error: Error): void {
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
