import { deepReadDirSync } from '@sentry/node';
import { hasTracingEnabled } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { fill } from '@sentry/utils';
import * as http from 'http';
import { default as createNextServer } from 'next';
import * as path from 'path';
import * as url from 'url';

import * as Sentry from '../index.server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObject<T = any> = { [key: string]: T };

interface NextServer {
  server: Server;
  createServer: (options: PlainObject) => Server;
}

interface Server {
  dir: string;
  publicDir: string;
}

interface NextRequest extends http.IncomingMessage {
  cookies: Record<string, string>;
  url: string;
}

interface NextResponse extends http.ServerResponse {
  __sentry__: {
    transaction?: Transaction;
  };
}

type HandlerGetter = () => Promise<ReqHandler>;
type ReqHandler = (req: NextRequest, res: NextResponse, parsedUrl?: url.UrlWithParsedQuery) => Promise<void>;
type ErrorLogger = (err: Error) => void;

// these aliases are purely to make the function signatures more easily understandable
type WrappedHandlerGetter = HandlerGetter;
type WrappedErrorLogger = ErrorLogger;
type WrappedReqHandler = ReqHandler;

// TODO is it necessary for this to be an object?
const closure: PlainObject = {};

let sdkInitialized = false;

/**
 * Do the monkeypatching and wrapping necessary to catch errors in page routes. Along the way, as a bonus, grab (and
 * return) the path of the project root, for use in `RewriteFrames`.
 *
 * @returns The absolute path of the project root directory
 *
 */
export function instrumentServer(): string {
  const nextServerPrototype = Object.getPrototypeOf(createNextServer({}));

  // wrap this getter because it runs before the request handler runs, which gives us a chance to wrap the logger before
  // it's called for the first time
  fill(nextServerPrototype, 'getServerRequestHandler', makeWrappedHandlerGetter);
  if (!sdkInitialized) {
    require(path.join(process.cwd(), 'sentry.server.config.js'));
    sdkInitialized = true;
  }

  return closure.projectRootDir;
}

/**
 * Create a wrapped version of Nextjs's `NextServer.getServerRequestHandler` method, as a way to access the running
 * `Server` instance and monkeypatch its prototype.
 *
 * @param origHandlerGetter Nextjs's `NextServer.getServerRequestHandler` method
 * @returns A wrapped version of the same method, to monkeypatch in at server startup
 */
function makeWrappedHandlerGetter(origHandlerGetter: HandlerGetter): WrappedHandlerGetter {
  // We wrap this purely in order to be able to grab data and do further monkeypatching the first time it runs.
  // Otherwise, it's just a pass-through to the original method.
  const wrappedHandlerGetter = async function(this: NextServer): Promise<ReqHandler> {
    if (!closure.wrappingComplete) {
      closure.projectRootDir = this.server.dir;
      closure.server = this.server;
      closure.publicDir = this.server.publicDir;

      const serverPrototype = Object.getPrototypeOf(this.server);

      // wrap the logger so we can capture errors in page-level functions like `getServerSideProps`
      fill(serverPrototype, 'logError', makeWrappedErrorLogger);

      fill(serverPrototype, 'handleRequest', makeWrappedReqHandler);

      closure.wrappingComplete = true;
    }

    return origHandlerGetter.call(this);
  };

  return wrappedHandlerGetter;
}

/**
 * Wrap the error logger used by the server to capture exceptions which arise from functions like `getServerSideProps`.
 *
 * @param origErrorLogger The original logger from the `Server` class
 * @returns A wrapped version of that logger
 */
function makeWrappedErrorLogger(origErrorLogger: ErrorLogger): WrappedErrorLogger {
  return function(this: Server, err: Error): void {
    // TODO add context data here
    Sentry.captureException(err);
    return origErrorLogger.call(this, err);
  };
}

/**
 * Wrap the server's request handler to be able to create request transactions.
 *
 * @param origReqHandler The original request handler from the `Server` class
 * @returns A wrapped version of that handler
 */
function makeWrappedReqHandler(origReqHandler: ReqHandler): WrappedReqHandler {
  const liveServer = closure.server as Server;

  // inspired by
  // https://github.com/vercel/next.js/blob/4443d6f3d36b107e833376c2720c1e206eee720d/packages/next/next-server/server/next-server.ts#L1166
  const publicDirFiles = new Set(
    deepReadDirSync(liveServer.publicDir).map(p =>
      encodeURI(
        // switch any backslashes in the path to regular slashes
        p.replace(/\\/g, '/'),
      ),
    ),
  );

  // add transaction start and stop to the normal request handling
  const wrappedReqHandler = async function(
    this: Server,
    req: NextRequest,
    res: NextResponse,
    parsedUrl?: url.UrlWithParsedQuery,
  ): Promise<void> {
    // We only want to record page and API requests
    if (hasTracingEnabled() && shouldTraceRequest(req.url, publicDirFiles)) {
      const transaction = Sentry.startTransaction({
        name: `${(req.method || 'GET').toUpperCase()} ${req.url}`,
        op: 'http.server',
      });
      Sentry.getCurrentHub()
        .getScope()
        ?.setSpan(transaction);

      res.__sentry__ = {};
      res.__sentry__.transaction = transaction;
    }

    res.once('finish', () => {
      const transaction = res.__sentry__?.transaction;
      if (transaction) {
        // Push `transaction.finish` to the next event loop so open spans have a chance to finish before the transaction
        // closes
        setImmediate(() => {
          // TODO
          // addExpressReqToTransaction(transaction, req);
          transaction.setHttpStatus(res.statusCode);
          transaction.finish();
        });
      }
    });

    return origReqHandler.call(this, req, res, parsedUrl);
  };

  return wrappedReqHandler;
}

/**
 * Determine if the request should be traced, by filtering out requests for internal next files and static resources.
 *
 * @param url The URL of the request
 * @param publicDirFiles A set containing relative paths to all available static resources (note that this does not
 * include static *pages*, but rather images and the like)
 * @returns false if the URL is for an internal or static resource
 */
function shouldTraceRequest(url: string, publicDirFiles: Set<string>): boolean {
  // `static` is a deprecated but still-functional location for static resources
  return !url.startsWith('/_next/') && !url.startsWith('/static/') && !publicDirFiles.has(url);
}
