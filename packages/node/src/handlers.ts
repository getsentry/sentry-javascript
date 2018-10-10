import { logger } from '@sentry/core';
import { getCurrentHub, Scope } from '@sentry/hub';
import { SentryEvent, Severity } from '@sentry/types';
import { forget } from '@sentry/utils/async';
import { serialize } from '@sentry/utils/object';
import * as cookie from 'cookie';
import * as domain from 'domain';
import * as http from 'http';
import * as os from 'os';
import * as url from 'url';
import { NodeClient } from './client';

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

/** JSDoc */
function extractRequestData(req: { [key: string]: any }): { [key: string]: string } {
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
  // query string:
  //   node: req.url (raw)
  //   express, koa: req.query
  const query = req.query || url.parse(originalUrl || '', true).query;
  // cookies:
  //   node, express, koa: req.headers.cookie
  const cookies = cookie.parse(headers.cookie || '');
  // body data:
  //   node, express, koa: req.body
  let data = req.body;
  if (method === 'GET' || method === 'HEAD') {
    if (typeof data === 'undefined') {
      data = '<unavailable>';
    }
  }
  if (data && typeof data !== 'string' && {}.toString.call(data) !== '[object String]') {
    // Make sure the request body is a string
    data = serialize(data);
  }

  // request interface
  const request: {
    [key: string]: any;
  } = {
    cookies,
    data,
    headers,
    method,
    query_string: query,
    url: absoluteUrl,
  };

  return request;
}

/** JSDoc */
const DEFAULT_USER_ATTRIBUTES = ['id', 'username', 'email'];
function extractUserData(req: { [key: string]: any }, userOption: boolean | Array<string>): { [key: string]: string } {
  const user: { [key: string]: string } = {};
  const attributes = Array.isArray(userOption) && userOption.length ? userOption : DEFAULT_USER_ATTRIBUTES;

  attributes.forEach(key => {
    if ({}.hasOwnProperty.call(req.user, key)) {
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

/** JSDoc */
function parseRequest(
  event: SentryEvent,
  req: {
    [key: string]: any;
  },
  options?: {
    request?: boolean;
    serverName?: boolean;
    transaction?: boolean | TransactionTypes;
    user?: boolean | Array<string>;
    version?: boolean;
  },
): SentryEvent {
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
      ...extractRequestData(req),
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

  if (options.transaction) {
    const transaction = extractTransaction(req, options.transaction);
    if (transaction) {
      event.transaction = transaction;
    }
  }

  return event;
}

/** JSDoc */
export function requestHandler(options?: {
  request?: boolean;
  serverName?: boolean;
  transaction?: boolean | TransactionTypes;
  user?: boolean | Array<string>;
  version?: boolean;
}): (req: http.IncomingMessage, res: http.ServerResponse, next: (error?: any) => void) => void {
  return function sentryRequestMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error?: any) => void,
  ): void {
    const local = domain.create();
    local.add(req);
    local.add(res);
    local.on('error', next);
    local.run(() => {
      getCurrentHub().configureScope(scope =>
        scope.addEventProcessor(async (event: SentryEvent) => parseRequest(event, req, options)),
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

/** JSDoc */
export function errorHandler(): (
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
    const status = getStatusCodeFromResponse(error);
    if (status < 500) {
      next(error);
      return;
    }
    getCurrentHub().captureException(error, { originalException: error });
    next(error);
  };
}

/** JSDoc */
export function defaultOnFatalError(error: Error): void {
  console.error(error && error.stack ? error.stack : error);
  const options = (getCurrentHub().getClient() as NodeClient).getOptions();
  const timeout =
    (options && options.shutdownTimeout && options.shutdownTimeout > 0 && options.shutdownTimeout) ||
    DEFAULT_SHUTDOWN_TIMEOUT;
  forget(
    (getCurrentHub().getClient() as NodeClient).close(timeout).then((result: boolean) => {
      if (!result) {
        logger.warn('We reached the timeout for emptying the request buffer, still exiting now!');
      }
      global.process.exit(1);
    }),
  );
}

/** JSDoc */
export function makeErrorHandler(
  onFatalError: (firstError: Error, secondError?: Error) => void = defaultOnFatalError,
): (error: Error) => void {
  const timeout = 2000;
  let caughtFirstError: boolean = false;
  let caughtSecondError: boolean = false;
  let calledFatalError: boolean = false;
  let firstError: Error;

  return (error: Error): void => {
    if (!caughtFirstError) {
      // this is the first uncaught error and the ultimate reason for shutting down
      // we want to do absolutely everything possible to ensure it gets captured
      // also we want to make sure we don't go recursion crazy if more errors happen after this one
      firstError = error;
      caughtFirstError = true;

      getCurrentHub().withScope(async () => {
        getCurrentHub().configureScope((scope: Scope) => {
          scope.addEventProcessor(async (event: SentryEvent) => ({
            ...event,
            level: Severity.Fatal,
          }));
        });

        getCurrentHub().captureException(error, { originalException: error });

        if (!calledFatalError) {
          calledFatalError = true;
          onFatalError(error);
        }
      });
    } else if (calledFatalError) {
      // we hit an error *after* calling onFatalError - pretty boned at this point, just shut it down
      logger.warn('uncaught exception after calling fatal error shutdown callback - this is bad! forcing shutdown');
      defaultOnFatalError(error);
    } else if (!caughtSecondError) {
      // two cases for how we can hit this branch:
      //   - capturing of first error blew up and we just caught the exception from that
      //     - quit trying to capture, proceed with shutdown
      //   - a second independent error happened while waiting for first error to capture
      //     - want to avoid causing premature shutdown before first error capture finishes
      // it's hard to immediately tell case 1 from case 2 without doing some fancy/questionable domain stuff
      // so let's instead just delay a bit before we proceed with our action here
      // in case 1, we just wait a bit unnecessarily but ultimately do the same thing
      // in case 2, the delay hopefully made us wait long enough for the capture to finish
      // two potential nonideal outcomes:
      //   nonideal case 1: capturing fails fast, we sit around for a few seconds unnecessarily before proceeding correctly by calling onFatalError
      //   nonideal case 2: case 2 happens, 1st error is captured but slowly, timeout completes before capture and we treat second error as the sendErr of (nonexistent) failure from trying to capture first error
      // note that after hitting this branch, we might catch more errors where (caughtSecondError && !calledFatalError)
      //   we ignore them - they don't matter to us, we're just waiting for the second error timeout to finish
      caughtSecondError = true;
      setTimeout(() => {
        if (!calledFatalError) {
          // it was probably case 1, let's treat err as the sendErr and call onFatalError
          calledFatalError = true;
          onFatalError(firstError, error);
        } else {
          // it was probably case 2, our first error finished capturing while we waited, cool, do nothing
        }
      }, timeout); // capturing could take at least sendTimeout to fail, plus an arbitrary second for how long it takes to collect surrounding source etc
    }
  };
}
