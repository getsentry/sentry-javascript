import { loadModule } from '@sentry/utils';
import type * as Express from 'express';

import { createRoutes, instrumentBuild, startRequestHandlerTransaction } from '../instrumentServer';
import { ExpressCreateRequestHandler, ExpressRequestHandler, ReactRouterDomPkg, ServerBuild } from '../types';

interface ExpressCreateRequestHandlerOptions {
  build: ServerBuild;
  getLoadContext?: GetLoadContextFunction;
  mode?: string;
}

type GetLoadContextFunction = (req: any, res: any) => any;

function wrapExpressRequestHandler(
  origRequestHandler: ExpressRequestHandler,
  build: ServerBuild,
): ExpressRequestHandler {
  const routes = createRoutes(build.routes);
  const pkg = loadModule<ReactRouterDomPkg>('react-router-dom');

  return async function (
    this: unknown,
    req: Express.Request,
    res: Express.Response,
    next: Express.NextFunction,
  ): Promise<void> {
    const transaction = startRequestHandlerTransaction(req, routes, pkg);

    await origRequestHandler.call(this, req, res, next);

    transaction?.setHttpStatus(res.statusCode);
    transaction?.finish();
  };
}

/**
 *
 */
export function wrapExpressCreateRequestHandler(
  origCreateRequestHandler: ExpressCreateRequestHandler,
): (options: any) => ExpressRequestHandler {
  return function (this: unknown, options: any): ExpressRequestHandler {
    const newBuild = instrumentBuild((options as ExpressCreateRequestHandlerOptions).build);
    const requestHandler = origCreateRequestHandler.call(this, { ...options /* :, build  newBuild */ });

    return wrapExpressRequestHandler(requestHandler, newBuild);
  };
}
