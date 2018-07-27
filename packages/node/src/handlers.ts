import { getHubFromCarrier } from '@sentry/hub';
import { SentryEvent, Severity } from '@sentry/types';
import { serialize } from '@sentry/utils/object';
import { parse as parseCookie } from 'cookie';
import * as domain from 'domain';
import * as lsmod from 'lsmod';
import { hostname } from 'os';
import { parse as parseUrl } from 'url';
import { getDefaultHub } from './hub';

let moduleCache: { [key: string]: string };

/** JSDoc */
function getModules(): { [key: string]: string } {
  if (!moduleCache) {
    // tslint:disable-next-line:no-unsafe-any
    moduleCache = lsmod();
  }
  return moduleCache;
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
  const query = req.query || parseUrl(originalUrl || '', true).query;
  // cookies:
  //   node, express, koa: req.headers.cookie
  const cookies = parseCookie(headers.cookie || '');
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
function extractUserData(req: { [key: string]: any }): { [key: string]: string } {
  const user: { [key: string]: string } = {};

  ['id', 'username', 'email'].forEach(key => {
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
): SentryEvent {
  const preparedEvent = {
    ...event,
    extra: {
      ...event.extra,
      node: global.process.version,
    },
    modules: getModules(),
    // TODO: `platform` shouldn't be relying on `parseRequest` usage
    // or we could just change the name and make it generic middleware
    platform: 'node',
    request: {
      ...event.request,
      ...extractRequestData(req),
    },
    server_name: global.process.env.SENTRY_NAME || hostname(),
  };

  if (req.user) {
    preparedEvent.user = {
      ...event.user,
      ...extractUserData(req),
    };
  }

  return preparedEvent;
}

/** JSDoc */
export function requestHandler(): (req: Request, res: Response, next: () => void) => void {
  return function sentryRequestMiddleware(req: Request, _res: Response, next: () => void): void {
    // TODO: Do we even need domain when we use middleware like approach? — Kamil
    const local = domain.create();
    const hub = getHubFromCarrier(req);
    hub.bindClient(getDefaultHub().getClient());
    hub.addEventProcessor(async (event: SentryEvent) => parseRequest(event, req));
    local.on('error', next);
    local.run(next);
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
  req: Request,
  res: Response,
  next: (error: MiddlewareError) => void,
) => void {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    req: Request,
    _res: Response,
    next: (error: MiddlewareError) => void,
  ): void {
    const status = getStatusCodeFromResponse(error);
    if (status < 500) {
      next(error);
      return;
    }
    getHubFromCarrier(req).captureException(error);
    next(error);
  };
}

/** JSDoc */
export function defaultOnFatalError(error: Error): void {
  console.error(error && error.stack ? error.stack : error);
  global.process.exit(1);
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

      getDefaultHub().withScope(async () => {
        getDefaultHub().addEventProcessor(async (event: SentryEvent) => ({
          ...event,
          level: Severity.Fatal,
        }));

        getDefaultHub().captureException(error);

        if (!calledFatalError) {
          calledFatalError = true;
          onFatalError(error);
        }
      });
    } else if (calledFatalError) {
      // we hit an error *after* calling onFatalError - pretty boned at this point, just shut it down
      // TODO: Use consoleAlert or some other way to log our debug messages
      console.warn('uncaught exception after calling fatal error shutdown callback - this is bad! forcing shutdown');
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
