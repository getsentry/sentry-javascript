/* eslint-disable max-lines */
import {
  captureException,
  configureScope,
  deepReadDirSync,
  getCurrentHub,
  Handlers,
  startTransaction,
} from '@sentry/node';
import { extractTraceparentData, getActiveTransaction, hasTracingEnabled } from '@sentry/tracing';
import { addExceptionMechanism, fill, isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';
import * as domain from 'domain';
import * as http from 'http';
import { default as createNextServer } from 'next';
import * as querystring from 'querystring';
import * as url from 'url';

const { parseRequest } = Handlers;

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

export type NextRequest = (
  | http.IncomingMessage // in nextjs versions < 12.0.9, `NextRequest` extends `http.IncomingMessage`
  | {
      _req: http.IncomingMessage; // in nextjs versions >= 12.0.9, `NextRequest` wraps `http.IncomingMessage`
    }
) & {
  cookies: Record<string, string>;
  url: string;
  query: { [key: string]: string };
  headers: { [key: string]: string };
  body: string | { [key: string]: unknown };
  method: string;
};

type NextResponse =
  // in nextjs versions < 12.0.9, `NextResponse` extends `http.ServerResponse`
  | http.ServerResponse
  // in nextjs versions >= 12.0.9, `NextResponse` wraps `http.ServerResponse`
  | {
      _res: http.ServerResponse;
    };

// the methods we'll wrap
type HandlerGetter = () => Promise<ReqHandler>;
type ReqHandler = (nextReq: NextRequest, nextRes: NextResponse, parsedUrl?: url.UrlWithParsedQuery) => Promise<void>;
type ErrorLogger = (err: Error) => void;
type ApiPageEnsurer = (path: string) => Promise<void>;
type PageComponentFinder = (
  pathname: string,
  query: querystring.ParsedUrlQuery,
  params: { [key: string]: unknown } | null,
) => Promise<{ [key: string]: unknown } | null>;

// these aliases are purely to make the function signatures more easily understandable
type WrappedHandlerGetter = HandlerGetter;
type WrappedErrorLogger = ErrorLogger;
type WrappedReqHandler = ReqHandler;
type WrappedApiPageEnsurer = ApiPageEnsurer;
type WrappedPageComponentFinder = PageComponentFinder;

let liveServer: Server;
let sdkSetupComplete = false;

/**
 * Do the monkeypatching and wrapping necessary to catch errors in page routes and record transactions for both page and
 * API routes.
 */
export function instrumentServer(): void {
  // The full implementation here involves a lot of indirection and multiple layers of callbacks and wrapping, and is
  // therefore potentially a little hard to follow. Here's the overall idea:

  // Next.js uses two server classes, `NextServer` and `Server`, with the former proxying calls to the latter, which
  // then does the all real work. The only access we have to either is through Next's default export,
  // `createNextServer()`, which returns a `NextServer` instance.

  // At server startup:
  //    `next.config.js` imports SDK ->
  //    SDK's `index.ts` runs ->
  //    `instrumentServer()` (the function we're in right now) ->
  //    `createNextServer()` ->
  //    `NextServer` instance ->
  //    `NextServer` prototype ->
  //    Wrap `NextServer.getServerRequestHandler()`, purely to get us to the next step

  // At time of first request:
  //    Wrapped `getServerRequestHandler` runs for the first time ->
  //    Live `NextServer` instance(via`this`) ->
  //    Live `Server` instance (via `NextServer.server`) ->
  //    `Server` prototype ->
  //    Wrap `Server.logError`, `Server.handleRequest`, `Server.ensureApiPage`, and `Server.findPageComponents` methods,
  //    then fulfill original purpose of function by passing wrapped version of `handleRequest` to caller

  // Whenever caller of `NextServer.getServerRequestHandler` calls the wrapped `Server.handleRequest`:
  //    Trace request

  // Whenever something calls the wrapped `Server.logError`:
  //    Capture error

  // Whenever an API request is handled and the wrapped `Server.ensureApiPage` is called, or whenever a page request is
  // handled and the wrapped `Server.findPageComponents` is called:
  //    Replace URL in transaction name with parameterized version

  const nextServerPrototype = Object.getPrototypeOf(createNextServer({}));
  fill(nextServerPrototype, 'getServerRequestHandler', makeWrappedHandlerGetter);
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
  const wrappedHandlerGetter = async function (this: NextServer): Promise<ReqHandler> {
    if (!sdkSetupComplete) {
      // stash this in the closure so that `makeWrappedReqHandler` can use it
      liveServer = this.server;
      const serverPrototype = Object.getPrototypeOf(liveServer);

      // Wrap for error capturing (`logError` gets called by `next` for all server-side errors)
      fill(serverPrototype, 'logError', makeWrappedErrorLogger);

      // Wrap for request transaction creation (`handleRequest` is called for all incoming requests, and dispatches them
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
  return function (this: Server, err: Error): void {
    // TODO add more context data here

    // We can use `configureScope` rather than `withScope` here because we're using domains to ensure that each request
    // gets its own scope. (`configureScope` has the advantage of not creating a clone of the current scope before
    // modifying it, which in this case is unnecessary.)
    configureScope(scope => {
      scope.addEventProcessor(event => {
        addExceptionMechanism(event, {
          type: 'instrument',
          handled: true,
          data: {
            function: 'logError',
          },
        });
        return event;
      });
    });

    captureException(err);

    return origErrorLogger.call(this, err);
  };
}

// inspired by next's public file routing; see
// https://github.com/vercel/next.js/blob/4443d6f3d36b107e833376c2720c1e206eee720d/packages/next/next-server/server/next-server.ts#L1166
function getPublicDirFiles(): Set<string> {
  try {
    // we need the paths here to match the format of a request url, which means they must:
    // - start with a slash
    // - use forward slashes rather than backslashes
    // - be URL-encoded
    const dirContents = deepReadDirSync(liveServer.publicDir).map(filepath =>
      encodeURI(`/${filepath.replace(/\\/g, '/')}`),
    );
    return new Set(dirContents);
  } catch (_) {
    return new Set();
  }
}

/**
 * Wrap the server's request handler to be able to create request transactions.
 *
 * @param origReqHandler The original request handler from the `Server` class
 * @returns A wrapped version of that handler
 */
function makeWrappedReqHandler(origReqHandler: ReqHandler): WrappedReqHandler {
  const publicDirFiles = getPublicDirFiles();
  // add transaction start and stop to the normal request handling
  const wrappedReqHandler = async function (
    this: Server,
    nextReq: NextRequest,
    nextRes: NextResponse,
    parsedUrl?: url.UrlWithParsedQuery,
  ): Promise<void> {
    // Starting with version 12.0.9, nextjs wraps the incoming request in a `NodeNextRequest` object and the outgoing
    // response in a `NodeNextResponse` object before passing them to the handler. (This is necessary here but not in
    // `withSentry` because by the time nextjs passes them to an API handler, it's unwrapped them again.)
    const req = '_req' in nextReq ? nextReq._req : nextReq;
    const res = '_res' in nextRes ? nextRes._res : nextRes;

    // wrap everything in a domain in order to prevent scope bleed between requests
    const local = domain.create();
    local.add(req);
    local.add(res);
    // TODO could this replace wrapping the error logger?
    // local.on('error', Sentry.captureException);

    local.run(() => {
      const currentScope = getCurrentHub().getScope();

      if (currentScope) {
        currentScope.addEventProcessor(event => parseRequest(event, nextReq));

        // We only want to record page and API requests
        if (hasTracingEnabled() && shouldTraceRequest(nextReq.url, publicDirFiles)) {
          // If there is a trace header set, extract the data from it (parentSpanId, traceId, and sampling decision)
          let traceparentData;
          if (nextReq.headers && isString(nextReq.headers['sentry-trace'])) {
            traceparentData = extractTraceparentData(nextReq.headers['sentry-trace'] as string);
            logger.log(`[Tracing] Continuing trace ${traceparentData?.traceId}.`);
          }

          // pull off query string, if any
          const reqPath = stripUrlQueryAndFragment(nextReq.url);

          // requests for pages will only ever be GET requests, so don't bother to include the method in the transaction
          // name; requests to API routes could be GET, POST, PUT, etc, so do include it there
          const namePrefix = nextReq.url.startsWith('/api') ? `${nextReq.method.toUpperCase()} ` : '';

          const transaction = startTransaction(
            {
              name: `${namePrefix}${reqPath}`,
              op: 'http.server',
              metadata: { requestPath: reqPath },
              ...traceparentData,
            },
            // Extra context passed to the `tracesSampler` (Note: We're combining `nextReq` and `req` this way in order
            // to not break people's `tracesSampler` functions, even though the format of `nextReq` has changed (see
            // note above re: nextjs 12.0.9). If `nextReq === req` (pre 12.0.9), then spreading `req` is a no-op - we're
            // just spreading the same stuff twice. If `nextReq` contains `req` (12.0.9 and later), then spreading `req`
            // mimics the old format by flattening the data.)
            { request: { ...nextReq, ...req } },
          );

          currentScope.setSpan(transaction);

          res.once('finish', () => {
            const transaction = getActiveTransaction();
            if (transaction) {
              transaction.setHttpStatus(res.statusCode);

              // we'll collect this data in a more targeted way in the event processor we added above,
              // `addRequestDataToEvent`
              delete transaction.metadata.requestPath;

              // Push `transaction.finish` to the next event loop so open spans have a chance to finish before the
              // transaction closes
              setImmediate(() => {
                transaction.finish();
              });
            }
          });
        }
      }

      return origReqHandler.call(this, nextReq, nextRes, parsedUrl);
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
  const wrappedMethod = async function (this: Server, parameterizedPath: string, ...args: any[]): Promise<any> {
    const transaction = getActiveTransaction();

    // replace specific URL with parameterized version
    if (transaction && transaction.metadata.requestPath) {
      const origPath = transaction.metadata.requestPath;
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
