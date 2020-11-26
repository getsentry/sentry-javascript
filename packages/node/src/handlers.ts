/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { captureException, getCurrentHub, startTransaction, withScope } from '@sentry/core';
import { extractTraceparentData, Span } from '@sentry/tracing';
import { Event, Transaction } from '@sentry/types';
import {
  extractNodeRequestData,
  forget,
  isPlainObject,
  isString,
  logger,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import * as domain from 'domain';
import * as http from 'http';
import * as os from 'os';
import * as url from 'url';

import { NodeClient } from './client';
import { flush } from './sdk';

const DEFAULT_SHUTDOWN_TIMEOUT = 2000;

interface ExpressRequest {
  route?: {
    path: string;
  };
  method: string;
  originalUrl: string;
  baseUrl: string;
  query: string;
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
    // TODO: At this point `req.route.path` (which we use in `extractTransaction`) is not available
    // but `req.path` or `req.url` should do the job as well. We could unify this here.
    const reqMethod = (req.method || '').toUpperCase();
    const reqUrl = req.url && stripUrlQueryAndFragment(req.url);

    // If there is a trace header set, we extract the data from it (parentSpanId, traceId, and sampling decision)
    let traceparentData;
    if (req.headers && isString(req.headers['sentry-trace'])) {
      traceparentData = extractTraceparentData(req.headers['sentry-trace'] as string);
    }

    const transaction = startTransaction({
      name: `${reqMethod} ${reqUrl}`,
      op: 'http.server',
      ...traceparentData,
    });

    // We put the transaction on the scope so users can attach children to it
    getCurrentHub().configureScope(scope => {
      scope.setSpan(transaction);
    });

    // We also set __sentry_transaction on the response so people can grab the transaction there to add
    // spans to it later.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (res as any).__sentry_transaction = transaction;

    res.once('finish', () => {
      // We schedule the immediate execution of the `finish` to let all the spans being closed first.
      setImmediate(() => {
        addExpressReqToTransaction(transaction, (req as unknown) as ExpressRequest);
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
  if (req.route) {
    transaction.name = `${req.method} ${req.baseUrl}${req.route.path}`;
  }
  transaction.setData('url', req.originalUrl);
  transaction.setData('baseUrl', req.baseUrl);
  transaction.setData('query', req.query);
}

type TransactionTypes = 'path' | 'methodPath' | 'handler';

/** JSDoc */
function extractTransaction(req: { [key: string]: any }, type: boolean | TransactionTypes): string | undefined {
  try {
    // Express.js shape
    const request = req as {
      url: string;
      originalUrl: string;
      method: string;
      route: {
        path: string;
        stack: [
          {
            name: string;
          },
        ];
      };
    };

    let routePath;
    try {
      routePath = url.parse(request.originalUrl || request.url).pathname;
    } catch (_oO) {
      routePath = request.route.path;
    }

    switch (type) {
      case 'path': {
        return routePath;
      }
      case 'handler': {
        return request.route.stack[0].name;
      }
      case 'methodPath':
      default: {
        const method = request.method.toUpperCase();
        return `${method} ${routePath}`;
      }
    }
  } catch (_oO) {
    return undefined;
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

/**
 * Options deciding what parts of the request to use when enhancing an event
 */
export interface ParseRequestOptions {
  ip?: boolean;
  request?: boolean | string[];
  serverName?: boolean;
  transaction?: boolean | TransactionTypes;
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
export function parseRequest(
  event: Event,
  req: {
    [key: string]: any;
    user?: {
      [key: string]: any;
    };
    ip?: string;
    connection?: {
      remoteAddress?: string;
    };
  },
  options?: ParseRequestOptions,
): Event {
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
    // if the option value is `true`, use the default set of keys by not passing anything to `extractNodeRequestData()`
    const extractedRequestData = Array.isArray(options.request)
      ? extractNodeRequestData(req, options.request)
      : extractNodeRequestData(req);
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
    const transaction = extractTransaction(req, options.transaction);
    if (transaction) {
      event.transaction = transaction;
    }
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
