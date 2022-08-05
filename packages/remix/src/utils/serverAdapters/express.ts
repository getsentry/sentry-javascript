import { extractRequestData, loadModule } from '@sentry/utils';

import { createRoutes, instrumentBuild, startRequestHandlerTransaction } from '../instrumentServer';
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

  return async function (
    this: unknown,
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNextFunction,
  ): Promise<void> {
    const request = extractRequestData(req);

    if (!request.url || !request.method) {
      return origRequestHandler.call(this, req, res, next);
    }

    const url = new URL(request.url);

    const transaction = startRequestHandlerTransaction(url, request.method, routes, pkg);

    await origRequestHandler.call(this, req, res, next);

    transaction?.setHttpStatus(res.statusCode);
    transaction?.finish();
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
