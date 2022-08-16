import { getCurrentHub } from '@sentry/hub';
import { flush } from '@sentry/node';
import { hasTracingEnabled } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { extractRequestData, loadModule, logger } from '@sentry/utils';

import {
  createRoutes,
  instrumentBuild,
  isRequestHandlerWrapped,
  startRequestHandlerTransaction,
} from '../instrumentServer';
import {
  ExpressCreateRequestHandler,
  ExpressCreateRequestHandlerOptions,
  ExpressNextFunction,
  ExpressRequest,
  ExpressRequestHandler,
  ExpressResponse,
  ReactRouterDomPkg,
  ServerBuild,
} from '../types';

function wrapExpressRequestHandler(
  origRequestHandler: ExpressRequestHandler,
  build: ServerBuild,
): ExpressRequestHandler {
  const routes = createRoutes(build.routes);
  const pkg = loadModule<ReactRouterDomPkg>('react-router-dom');

  // If the core request handler is already wrapped, don't wrap Express handler which uses it.
  if (isRequestHandlerWrapped) {
    return origRequestHandler;
  }

  return async function (
    this: unknown,
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    res.end = wrapEndMethod(res.end);

    const request = extractRequestData(req);
    const hub = getCurrentHub();
    const options = hub.getClient()?.getOptions();

    if (!options || !hasTracingEnabled(options) || !request.url || !request.method) {
      return origRequestHandler.call(this, req, res, next);
    }

    const url = new URL(request.url);
    startRequestHandlerTransaction(url, request.method, routes, hub, pkg);
    return origRequestHandler.call(this, req, res, next);
  };
}

/**
 * Instruments `createRequestHandler` from `@remix-run/express`
 */
export function wrapExpressCreateRequestHandler(
  origCreateRequestHandler: ExpressCreateRequestHandler,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (options: any) => ExpressRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: unknown, options: any): ExpressRequestHandler {
    const newBuild = instrumentBuild((options as ExpressCreateRequestHandlerOptions).build);
    const requestHandler = origCreateRequestHandler.call(this, { ...options, build: newBuild });

    return wrapExpressRequestHandler(requestHandler, newBuild);
  };
}

export type AugmentedExpressResponse = ExpressResponse & {
  __sentryTransaction?: Transaction;
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
  };
}

/**
 * Close the open transaction (if any) and flush events to Sentry.
 *
 * @param res The outgoing response for this request, on which the transaction is stored
 */
async function finishSentryProcessing(res: AugmentedExpressResponse): Promise<void> {
  const { __sentryTransaction: transaction } = res;

  if (transaction) {
    transaction.setHttpStatus(res.statusCode);

    // Push `transaction.finish` to the next event loop so open spans have a better chance of finishing before the
    // transaction closes, and make sure to wait until that's done before flushing events
    await new Promise(resolve => {
      setImmediate(() => {
        transaction.finish();
        resolve();
      });
    });
  }

  // Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda
  // ends. If there was an error, rethrow it so that the normal exception-handling mechanisms can apply.
  try {
    __DEBUG_BUILD__ && logger.log('Flushing events...');
    await flush(2000);
    __DEBUG_BUILD__ && logger.log('Done flushing events');
  } catch (e) {
    __DEBUG_BUILD__ && logger.log('Error while flushing events:\n', e);
  }
}
