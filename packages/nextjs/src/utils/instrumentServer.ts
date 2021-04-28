import { fill } from '@sentry/utils';
import * as http from 'http';
import { default as createNextServer } from 'next';
import * as url from 'url';

import * as Sentry from '../index.server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObject<T = any> = { [key: string]: T };

interface NextServer {
  server: Server;
}

interface Server {
  dir: string;
}

type HandlerGetter = () => Promise<ReqHandler>;
type ReqHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parsedUrl?: url.UrlWithParsedQuery,
) => Promise<void>;
type ErrorLogger = (err: Error) => void;

// these aliases are purely to make the function signatures more easily understandable
type WrappedHandlerGetter = HandlerGetter;
type WrappedErrorLogger = ErrorLogger;

// TODO is it necessary for this to be an object?
const closure: PlainObject = {};

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

      const serverPrototype = Object.getPrototypeOf(this.server);

      // wrap the logger so we can capture errors in page-level functions like `getServerSideProps`
      fill(serverPrototype, 'logError', makeWrappedErrorLogger);

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
  return (err: Error): void => {
    // TODO add context data here
    Sentry.captureException(err);
    return origErrorLogger(err);
  };
}
