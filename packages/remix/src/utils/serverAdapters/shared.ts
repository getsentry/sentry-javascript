import { flush, getClient, hasTracingEnabled, setHttpStatus, withIsolationScope } from '@sentry/core';
import type { PolymorphicRequest, Span } from '@sentry/types';
import { extractRequestData, fill, isString, logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { createRoutes, getTransactionName, instrumentBuild, startRequestHandlerSpan } from '../instrumentServer';
import type {
  AppLoadContext,
  CreateGenericRequestHandler,
  CreateRequestHandlerOptions,
  ExpressRequest,
  ExpressResponse,
  FastifyReply,
  FastifyRequest,
  GenericRequestHandler,
  GetLoadContextFunction,
  ServerBuild,
  ServerRoute,
} from '../vendor/types';

type SupportedRequest = FastifyRequest | ExpressRequest;
type SupportedResponse = FastifyReply | ExpressResponse;

export enum SupportedFramework {
  Express,
  Fastify,
}

export type AugmentedResponse = {
  __sentrySpan?: Span;
  statusCode: number;
};

export const wrapGetLoadContext = (provider: string) =>
  function wrapper<Req, Res>(getLoadContext: (req: Req, res: Res) => AppLoadContext): GetLoadContextFunction {
    return function (this: unknown, req: Req, res: Res): AppLoadContext {
      const loadContext = (getLoadContext.call(this, req, res) || {}) as AppLoadContext;
      loadContext[`__sentry_${provider}_wrapped__`] = true;
      return loadContext;
    };
  };

// wrap build function which returns either a Promise or the build itself
// This is currently only required for Vite development mode with HMR
export const wrapBuildFn = (
  origBuildFn: () => Promise<ServerBuild> | ServerBuild,
): (() => Promise<ServerBuild> | ServerBuild) => {
  return async function (this: unknown, ...args: unknown[]) {
    const build = origBuildFn.call(this, ...args);
    if (build instanceof Promise) {
      return build.then(resolved => instrumentBuild(resolved, true));
    }
    return instrumentBuild(build, true);
  };
};

/**
 * Wrap end method (e.g. `res.end` for Express or `res.send` for Fastify) so that
 * it closes the transaction and flushes events before letting the request finish.
 *
 * Note: This wraps a sync method with an async method. While in general that's not a great idea in terms of keeping
 * things in the right order, in this case it's safe, because the native `.end()` actually *is* async, and its run
 * actually *is* awaited, just manually so (which reflects the fact that the core of the request/response code in Node
 * by far predates the introduction of `async`/`await`). When `.end()` is done, it emits the `prefinish` event, and
 * only once that fires does request processing continue. See
 * https://github.com/nodejs/node/commit/7c9b607048f13741173d397795bac37707405ba7.
 *
 * @param end The original response ending method
 * @returns The wrapped version
 */
function wrapEndMethod<T extends ExpressResponse['end'] | FastifyReply['send']>(end: T): T {
  const wrapper = async function wrapper(this: AugmentedResponse, ...args: unknown[]): Promise<unknown> {
    await finishSentryProcessing(this);

    return end.call(this, ...args);
  };
  return wrapper as unknown as T;
}

/**
 * Close the open transaction (if any) and flush events to Sentry.
 *
 * @param res The outgoing response for this request, on which the transaction is stored
 */
async function finishSentryProcessing(res: AugmentedResponse): Promise<void> {
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

function startRequestHandlerTransactionWithRoutes(
  this: unknown,
  handler: GenericRequestHandler,
  framework: SupportedFramework,
  routes: ServerRoute[],
  req: SupportedRequest,
  res: SupportedResponse,
  next: unknown,
  url: URL,
): unknown {
  const [name, source] = getTransactionName(routes, url);
  return startRequestHandlerSpan(
    {
      name,
      source,
      sentryTrace: (req.headers && isString(req.headers['sentry-trace']) && req.headers['sentry-trace']) || '',
      baggage: (req.headers && isString(req.headers.baggage) && req.headers.baggage) || '',
      method:
        framework === SupportedFramework.Express
          ? (req as ExpressRequest).method
          : (req as FastifyRequest).raw?.method || '',
    },
    span => {
      // save a link to the transaction on the response, so that even if there's an error (landing us outside of
      // the domain), we can still finish it (albeit possibly missing some scope data)
      (res as AugmentedResponse).__sentrySpan = span;
      return handler.call(this, req, res, next);
    },
  );
}

export const wrapRequestHandler = <NextFn>(
  handler: GenericRequestHandler,
  framework: SupportedFramework,
  readyBuildOrGetBuildFn: ServerBuild | (() => Promise<ServerBuild> | ServerBuild),
): GenericRequestHandler => {
  let routes: ServerRoute[];

  return async function (this: unknown, req: PolymorphicRequest, res: SupportedResponse, next: NextFn): Promise<void> {
    await withIsolationScope(async isolationScope => {
      if (framework === SupportedFramework.Express) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        (res as ExpressResponse).end = wrapEndMethod((res as ExpressResponse).end);
      } else if (framework === SupportedFramework.Fastify) {
        (res as FastifyReply).send = wrapEndMethod((res as FastifyReply).send);
      } else {
        throw new Error('Ubnreachable');
      }

      const request = extractRequestData(req);

      const options = getClient()?.getOptions();

      isolationScope.setSDKProcessingMetadata({ request });

      if (!options || !hasTracingEnabled(options) || !request.url || !request.method) {
        return handler.call(this, req, res, next);
      }

      const url = new URL(request.url);

      if (typeof readyBuildOrGetBuildFn !== 'function') {
        routes = createRoutes(readyBuildOrGetBuildFn.routes);
        return startRequestHandlerTransactionWithRoutes.call(this, handler, framework, routes, req, res, next, url);
      }

      const build = readyBuildOrGetBuildFn();

      if (build instanceof Promise) {
        return build.then(resolved => {
          routes = createRoutes(resolved.routes);
          startRequestHandlerTransactionWithRoutes.call(this, handler, routes, framework, req, res, next, url);
        });
      }

      routes = createRoutes(build.routes);
      return startRequestHandlerTransactionWithRoutes.call(this, handler, routes, framework, req, res, next, url);
    });
  };
};

export const prepareWrapCreateRequestHandler = (forFramework: SupportedFramework) =>
  function wrapCreateRequestHandler(
    createRequestHandler: CreateGenericRequestHandler,
  ): (this: unknown, options: CreateRequestHandlerOptions) => GenericRequestHandler {
    return function (this: unknown, opts: CreateRequestHandlerOptions): GenericRequestHandler {
      if (!opts.getLoadContext) opts['getLoadContext'] = () => ({});
      fill(opts, 'getLoadContext', wrapGetLoadContext('fastify'));
      const build = typeof opts.build === 'function' ? wrapBuildFn(opts.build) : instrumentBuild(opts.build, true);
      const handler: GenericRequestHandler = createRequestHandler.call(this, { ...opts, build });
      return wrapRequestHandler(handler, forFramework, build);
    };
  };
