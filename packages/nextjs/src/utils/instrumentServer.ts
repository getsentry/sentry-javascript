import { deepReadDirSync } from '@sentry/node';
import { Transaction } from '@sentry/types';
import { getActiveTransaction, hasTracingEnabled } from '@sentry/tracing';
import { fill, logger } from '@sentry/utils';
import * as domain from 'domain';
import * as http from 'http';
import { default as createNextServer } from 'next';
import * as querystring from 'querystring';
import * as url from 'url';

import * as Sentry from '../index.server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObject<T = any> = { [key: string]: T };

// class used by `next` as a proxy to the real server; see
// https://github.com/vercel/next.js/blob/4443d6f3d36b107e833376c2720c1e206eee720d/packages/next/server/next.ts#L32
interface NextServer {
  server: Server;
  createServer: (options: PlainObject) => Server;
}

// `next`'s main server class; see
// https://github.com/vercel/next.js/blob/4443d6f3d36b107e833376c2720c1e206eee720d/packages/next/next-server/server/next-server.ts#L132
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
type ApiPageEnsurer = (path: string) => Promise<void>;
type PageComponentFinder = (
  pathname: string,
  query: querystring.ParsedUrlQuery,
  params: { [key: string]: any } | null,
) => Promise<{ [key: string]: any } | null>;

// these aliases are purely to make the function signatures more easily understandable
type WrappedHandlerGetter = HandlerGetter;
type WrappedErrorLogger = ErrorLogger;
type WrappedReqHandler = ReqHandler;
type WrappedApiPageEnsurer = ApiPageEnsurer;
type WrappedPageComponentFinder = PageComponentFinder;

// TODO is it necessary for this to be an object?
const closure: PlainObject = {};

let sdkSetupComplete = false;

/**
 * Do the monkeypatching and wrapping necessary to catch errors in page routes and record transactions for both page and
 * API routes. Along the way, as a bonus, grab (and return) the path of the project root, for use in `RewriteFrames`.
 *
 * @returns The absolute path of the project root directory
 *
 */
export function instrumentServer(): string {
  // The full implementation here involves a lot of indirection and multiple layers of callbacks and wrapping, and is
  // therefore potentially a little hard to follow. Here's the overall idea:

  // Next.js uses two server classes, `NextServer` and `Server`, with the former proxying calls to the latter, which
  // then does the all real work. The only access we have to either is through Next's default export,
  // `createNextServer()`, which returns a `NextServer` instance.

  // At server startup:
  //  `next.config.js` imports SDK -> SDK index.ts -> `instrumentServer()` (the function we're in right now) ->
  //  `createNextServer()` -> `NextServer` instance -> `NextServer` prototype -> wrap
  //  `NextServer.getServerRequestHandler()`, purely to get us to the next step

  // At time of first request:
  //  Wrapped `getServerRequestHandler` runs for the first time -> live `NextServer` instance (via `this`) -> live
  //  `Server` instance -> `Server` prototype -> wrap `Server.logError` and `Server.handleRequest` methods, then pass
  //  wrapped version of `handleRequest` to caller of `getServerRequestHandler`

  // Whenever caller of `NextServer.getServerRequestHandler` calls the wrapped `Server.handleRequest`:
  //   Trace request

  // Whenever something calls the wrapped `Server.logError`:
  //   Capture error

  const nextServerPrototype = Object.getPrototypeOf(createNextServer({}));
  fill(nextServerPrototype, 'getServerRequestHandler', makeWrappedHandlerGetter);

  // TODO replace with an env var, since at this point we don't have a value yet
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
    if (!sdkSetupComplete) {
      try {
        // `SENTRY_SERVER_INIT_PATH` is set at build time, and points to a webpack-processed version of the user's
        // `sentry.server.config.js`. Requiring it starts the SDK.
        require(process.env.SENTRY_SERVER_INIT_PATH as string);
      } catch (err) {
        // Log the error but don't bail - we still want the wrapping to happen, in case the user is doing something weird
        // and manually calling `Sentry.init()` somewhere else.
        logger.error(`[Sentry] Could not initialize SDK. Received error:\n${err}`);
      }

      // TODO: Replace projectRootDir with env variables
      closure.projectRootDir = this.server.dir;
      closure.server = this.server;
      closure.publicDir = this.server.publicDir;

      const serverPrototype = Object.getPrototypeOf(this.server);

      // wrap for error capturing (`logError` gets called by `next` for all server-side errors)
      fill(serverPrototype, 'logError', makeWrappedErrorLogger);

      // wrap for request transaction creation (`handleRequest` is called for all incoming requests, and dispatches them
      // to the appropriate handlers)
      fill(serverPrototype, 'handleRequest', makeWrappedReqHandler);

      // Wrap as a way to grab the parameterized request URL to use as the transaction name for API requests and page
      // requests, respectively. These methods are chosen because they're the first spot in the request-handling process
      // where the parameterized path is provided as an argument, so it's easy to grab.
      fill(serverPrototype, 'ensureApiPage', makeWrappedMethodForGettingParameterizedPath);
      fill(serverPrototype, 'findPageComponents', makeWrappedMethodForGettingParameterizedPath);

      sdkSetupComplete = true;
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

  // inspired by next's public file routing; see
  // https://github.com/vercel/next.js/blob/4443d6f3d36b107e833376c2720c1e206eee720d/packages/next/next-server/server/next-server.ts#L1166
  const publicDirFiles = new Set(
    // we need the paths here to match the format of a request url, which means they must:
    // - start with a slash
    // - use forward slashes rather than backslashes
    // - be URL-encoded
    deepReadDirSync(liveServer.publicDir).map(filepath => encodeURI(`/${filepath.replace(/\\/g, '/')}`)),
  );

  // add transaction start and stop to the normal request handling
  const wrappedReqHandler = async function(
    this: Server,
    req: NextRequest,
    res: NextResponse,
    parsedUrl?: url.UrlWithParsedQuery,
  ): Promise<void> {
    // wrap everything in a domain in order to prevent scope bleed between requests
    const local = domain.create();
    local.add(req);
    local.add(res);
    // TODO could this replace wrapping the error logger?
    // local.on('error', Sentry.captureException);

    local.run(() => {
      const currentScope = Sentry.getCurrentHub().getScope();

      if (currentScope) {
        // We only want to record page and API requests
        if (hasTracingEnabled() && shouldTraceRequest(req.url, publicDirFiles)) {
          // pull off query string, if any
          const reqPath = req.url.split('?')[0];

          // requests for pages will only ever be GET requests, so don't bother to include the method in the transaction
          // name; requests to API routes could be GET, POST, PUT, etc, so do include it there
          const namePrefix = req.url.startsWith('/api') ? `${(req.method || 'GET').toUpperCase()} ` : '';

          const transaction = Sentry.startTransaction({
            name: `${namePrefix}${reqPath}`,
            op: 'http.server',
            metadata: { request: req },
          });

          currentScope.setSpan(transaction);

          res.once('finish', () => {
            const transaction = getActiveTransaction();
            if (transaction) {
              transaction.setHttpStatus(res.statusCode);

              delete transaction.metadata.request;

              // Push `transaction.finish` to the next event loop so open spans have a chance to finish before the
              // transaction closes
              setImmediate(() => {
                transaction.finish();
              });
            }
          });
        }
      }

      return origReqHandler.call(this, req, res, parsedUrl);
    });
  };

  return wrappedReqHandler;
}

/**
 * Wrap the given method in order to use the parameterized path passed to it in the transaction name.
 *
 * @param origMethod Either `ensureApiPage` (called for every API request) or `findPageComponents` (called for every
 * page request), both from the `Server` class
 * @returns A wrapped version of the given method
 */
function makeWrappedMethodForGettingParameterizedPath(
  origMethod: ApiPageEnsurer | PageComponentFinder,
): WrappedApiPageEnsurer | WrappedPageComponentFinder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedMethod = async function(this: Server, parameterizedPath: string, ...args: any[]): Promise<any> {
    const transaction = getActiveTransaction();

    // replace specific URL with parameterized version
    if (transaction && transaction.metadata.request) {
      // strip query string, if any
      const origPath = transaction.metadata.request.url.split('?')[0];
      transaction.name = transaction.name.replace(origPath, parameterizedPath);
    }

    return origMethod.call(this, parameterizedPath, ...args);
  };

  return wrappedMethod;
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
