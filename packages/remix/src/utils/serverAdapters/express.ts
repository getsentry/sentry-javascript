import { extractRequestData, loadModule } from '@sentry/utils';
import * as domain from 'domain';

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
import { getCurrentHub } from '@sentry/hub';
import { hasTracingEnabled } from '@sentry/tracing';

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
    const local = domain.create();
    local.add(req);
    local.add(res);

    local.run(async () => {
      const request = extractRequestData(req);
      const hub = getCurrentHub();
      const options = hub.getClient()?.getOptions();

      if (!options || !hasTracingEnabled(options) || !request.url || !request.method) {
        return origRequestHandler.call(this, req, res, next);
      }

      const url = new URL(request.url);
      const transaction = startRequestHandlerTransaction(url, request.method, routes, hub, pkg);

      await origRequestHandler.call(this, req, res, next);

      transaction?.setHttpStatus(res.statusCode);
      transaction?.finish();
    });
  };
}

/**
 * Instruments `createRequestHandler` from `@remix-run/express`
 */
export function wrapExpressCreateRequestHandler(
  origCreateRequestHandler: ExpressCreateRequestHandler,
): (options: any) => ExpressRequestHandler {
  return function (this: unknown, options: any): ExpressRequestHandler {
    const newBuild = instrumentBuild((options as ExpressCreateRequestHandlerOptions).build);
    const requestHandler = origCreateRequestHandler.call(this, { ...options, build: newBuild });

    return wrapExpressRequestHandler(requestHandler, newBuild);
  };
}
