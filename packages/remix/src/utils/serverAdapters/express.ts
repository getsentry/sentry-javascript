import { getClient, hasTracingEnabled, setHttpStatus, withIsolationScope } from '@sentry/core';
import { flush } from '@sentry/node';
import type { Span } from '@sentry/types';
import { extractRequestData, fill, isString, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { createRoutes, getTransactionName, instrumentBuild, startRequestHandlerSpan } from '../instrumentServer';
import type {
  AppLoadContext,
  ExpressCreateRequestHandler,
  ExpressCreateRequestHandlerOptions,
  ExpressNextFunction,
  ExpressRequest,
  ExpressRequestHandler,
  ExpressResponse,
  GetLoadContextFunction,
  ServerBuild,
  ServerRoute,
} from '../vendor/types';

function wrapExpressRequestHandler(
  origRequestHandler: ExpressRequestHandler,
  build: ServerBuild | (() => Promise<ServerBuild> | ServerBuild),
): ExpressRequestHandler {
  let routes: ServerRoute[];

  return async function (
    this: unknown,
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction,
  ): Promise<void> {
    await withIsolationScope(async isolationScope => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      res.end = wrapEndMethod(res.end);

      const request = extractRequestData(req);
      const options = getClient()?.getOptions();

      isolationScope.setSDKProcessingMetadata({ request });

      if (!options || !hasTracingEnabled(options) || !request.url || !request.method) {
        return origRequestHandler.call(this, req, res, next);
      }

      const url = new URL(request.url);

      // This is only meant to be used on development servers, so we don't need to worry about performance here
      if (build && typeof build === 'function') {
        const resolvedBuild = build();

        if (resolvedBuild instanceof Promise) {
          return resolvedBuild.then(resolved => {
            routes = createRoutes(resolved.routes);

            startRequestHandlerTransactionWithRoutes.call(this, origRequestHandler, routes, req, res, next, url);
          });
        } else {
          routes = createRoutes(resolvedBuild.routes);

          return startRequestHandlerTransactionWithRoutes.call(this, origRequestHandler, routes, req, res, next, url);
        }
      } else {
        routes = createRoutes(build.routes);
      }

      return startRequestHandlerTransactionWithRoutes.call(this, origRequestHandler, routes, req, res, next, url);
    });
  };
}

function startRequestHandlerTransactionWithRoutes(
  this: unknown,
  origRequestHandler: ExpressRequestHandler,
  routes: ServerRoute[],
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction,
  url: URL,
): unknown {
  const [name, source] = getTransactionName(routes, url);

  return startRequestHandlerSpan(
    {
      name,
      source,
      sentryTrace: (req.headers && isString(req.headers['sentry-trace']) && req.headers['sentry-trace']) || '',
      baggage: (req.headers && isString(req.headers.baggage) && req.headers.baggage) || '',
      method: req.method,
    },
    span => {
      // save a link to the transaction on the response, so that even if there's an error (landing us outside of
      // the domain), we can still finish it (albeit possibly missing some scope data)
      (res as AugmentedExpressResponse).__sentrySpan = span;
      return origRequestHandler.call(this, req, res, next);
    },
  );
}

function wrapGetLoadContext(origGetLoadContext: () => AppLoadContext): GetLoadContextFunction {
  return function (this: unknown, req: ExpressRequest, res: ExpressResponse): AppLoadContext {
    const loadContext = (origGetLoadContext.call(this, req, res) || {}) as AppLoadContext;

    loadContext['__sentry_express_wrapped__'] = true;

    return loadContext;
  };
}

// wrap build function which returns either a Promise or the build itself
// This is currently only required for Vite development mode with HMR
function wrapBuildFn(origBuildFn: () => Promise<ServerBuild> | ServerBuild): () => Promise<ServerBuild> | ServerBuild {
  return async function (this: unknown, ...args: unknown[]) {
    const resolvedBuild = origBuildFn.call(this, ...args);

    if (resolvedBuild instanceof Promise) {
      return resolvedBuild.then(resolved => {
        return instrumentBuild(resolved, true);
      });
    }

    return instrumentBuild(resolvedBuild, true);
  };
}

// A wrapper around build if it's a Promise or a function that returns a Promise that calls instrumentServer on the resolved value
// This is currently only required for Vite development mode with HMR
function wrapBuild(
  build: ServerBuild | (() => Promise<ServerBuild> | ServerBuild),
): ServerBuild | (() => Promise<ServerBuild> | ServerBuild) {
  if (typeof build === 'function') {
    return wrapBuildFn(build);
  }

  return instrumentBuild(build, true);
}

/**
 * Instruments `createRequestHandler` from `@remix-run/express`
 */
export function wrapExpressCreateRequestHandler(
  origCreateRequestHandler: ExpressCreateRequestHandler,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (options: any) => ExpressRequestHandler {
  return function (this: unknown, options: ExpressCreateRequestHandlerOptions): ExpressRequestHandler {
    if (!('getLoadContext' in options)) {
      options['getLoadContext'] = () => ({});
    }

    fill(options, 'getLoadContext', wrapGetLoadContext);

    const newBuild = wrapBuild(options.build);
    const requestHandler = origCreateRequestHandler.call(this, {
      ...options,
      build: newBuild,
    });

    return wrapExpressRequestHandler(requestHandler, newBuild);
  };
}

export type AugmentedExpressResponse = ExpressResponse & {
  __sentrySpan?: Span;
};

type ResponseEndMethod = AugmentedExpressResponse['end'];
type WrappedResponseEndMethod = AugmentedExpressResponse['end'];

/**
 * Wrap `res.end()` so that it closes the transaction and flushes events before letting the request finish.
 *
 * Note: This wraps a sync method with an async method. While in general that's not a great idea in terms of keeping
 * things in the right order, in this case it's safe, because the native `.end()` actually *is* async, and its run
 * actually *is* awaited, just manually so (which reflects the fact that the core of the request/response code in Node
 * by far predates the introduction of `async`/`await`). When `.end()` is done, it emits the `prefinish` event, and
 * only once that fires does request processing continue. See
 * https://github.com/nodejs/node/commit/7c9b607048f13741173d397795bac37707405ba7.
 *
 * @param origEnd The original `res.end()` method
 * @returns The wrapped version
 */
function wrapEndMethod(origEnd: ResponseEndMethod): WrappedResponseEndMethod {
  return async function newEnd(this: AugmentedExpressResponse, ...args: unknown[]) {
    await finishSentryProcessing(this);

    return origEnd.call(this, ...args);
  } as unknown as WrappedResponseEndMethod;
}

/**
 * Close the open transaction (if any) and flush events to Sentry.
 *
 * @param res The outgoing response for this request, on which the transaction is stored
 */
async function finishSentryProcessing(res: AugmentedExpressResponse): Promise<void> {
  const { __sentrySpan: span } = res;

  if (span) {
    setHttpStatus(span, res.statusCode);

    // Push `transaction.finish` to the next event loop so open spans have a better chance of finishing before the
    // transaction closes, and make sure to wait until that's done before flushing events
    await new Promise<void>(resolve => {
      setImmediate(() => {
        span.end();
        resolve();
      });
    });
  }

  // Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda
  // ends. If there was an error, rethrow it so that the normal exception-handling mechanisms can apply.
  try {
    DEBUG_BUILD && logger.log('Flushing events...');
    await flush(2000);
    DEBUG_BUILD && logger.log('Done flushing events');
  } catch (e) {
    DEBUG_BUILD && logger.log('Error while flushing events:\n', e);
  }
}
