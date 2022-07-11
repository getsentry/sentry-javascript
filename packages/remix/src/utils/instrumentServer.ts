import { captureException, getCurrentHub } from '@sentry/node';
import { getActiveTransaction } from '@sentry/tracing';
import { addExceptionMechanism, fill, loadModule, logger, stripUrlQueryAndFragment } from '@sentry/utils';

// Types vendored from @remix-run/server-runtime@1.6.0:
// https://github.com/remix-run/remix/blob/f3691d51027b93caa3fd2cdfe146d7b62a6eb8f2/packages/remix-server-runtime/server.ts
type AppLoadContext = unknown;
type AppData = unknown;
type RequestHandler = (request: Request, loadContext?: AppLoadContext) => Promise<Response>;
type CreateRequestHandlerFunction = (build: ServerBuild, mode?: string) => RequestHandler;
type ServerRouteManifest = RouteManifest<Omit<ServerRoute, 'children'>>;
type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

interface Route {
  index?: boolean;
  caseSensitive?: boolean;
  id: string;
  parentId?: string;
  path?: string;
}

interface ServerRouteModule {
  action?: DataFunction;
  headers?: unknown;
  loader?: DataFunction;
}

interface ServerRoute extends Route {
  children: ServerRoute[];
  module: ServerRouteModule;
}

interface RouteManifest<Route> {
  [routeId: string]: Route;
}

interface ServerBuild {
  entry: {
    module: ServerEntryModule;
  };
  routes: ServerRouteManifest;
  assets: unknown;
}

interface HandleDocumentRequestFunction {
  (request: Request, responseStatusCode: number, responseHeaders: Headers, context: Record<symbol, unknown>):
    | Promise<Response>
    | Response;
}

interface HandleDataRequestFunction {
  (response: Response, args: DataFunctionArgs): Promise<Response> | Response;
}

interface ServerEntryModule {
  default: HandleDocumentRequestFunction;
  handleDataRequest?: HandleDataRequestFunction;
}

interface DataFunctionArgs {
  request: Request;
  context: AppLoadContext;
  params: Params;
}

interface DataFunction {
  (args: DataFunctionArgs): Promise<Response> | Response | Promise<AppData> | AppData;
}

function captureRemixServerException(err: Error, name: string): void {
  captureException(err, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'instrument',
        handled: true,
        data: {
          function: name,
        },
      });

      return event;
    });

    return scope;
  });
}

function makeWrappedDocumentRequestFunction(
  origDocumentRequestFunction: HandleDocumentRequestFunction,
): HandleDocumentRequestFunction {
  return async function (
    this: unknown,
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    context: Record<symbol, unknown>,
  ): Promise<Response> {
    let res: Response;

    const activeTransaction = getActiveTransaction();
    const currentScope = getCurrentHub().getScope();

    if (!activeTransaction || !currentScope) {
      return origDocumentRequestFunction.call(this, request, responseStatusCode, responseHeaders, context);
    }

    try {
      const span = activeTransaction.startChild({
        op: 'remix.server.documentRequest',
        description: activeTransaction.name,
        tags: {
          method: request.method,
          url: request.url,
        },
      });

      res = await origDocumentRequestFunction.call(this, request, responseStatusCode, responseHeaders, context);

      span.finish();
    } catch (err) {
      captureRemixServerException(err, 'documentRequest');
      throw err;
    }

    return res;
  };
}

function makeWrappedDataFunction(origFn: DataFunction, name: 'action' | 'loader'): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    let res: Response | AppData;
    const activeTransaction = getActiveTransaction();
    const currentScope = getCurrentHub().getScope();

    if (!activeTransaction || !currentScope) {
      return origFn.call(this, args);
    }

    try {
      const span = activeTransaction.startChild({
        op: `remix.server.${name}`,
        description: activeTransaction.name,
        tags: {
          name,
        },
      });

      if (span) {
        // Assign data function to hub to be able to see `db` transactions (if any) as children.
        currentScope.setSpan(span);
      }

      res = await origFn.call(this, args);

      currentScope.setSpan(activeTransaction);
      span.finish();
    } catch (err) {
      captureRemixServerException(err, name);
      throw err;
    }

    return res;
  };
}

function makeWrappedAction(origAction: DataFunction): DataFunction {
  return makeWrappedDataFunction(origAction, 'action');
}

function makeWrappedLoader(origAction: DataFunction): DataFunction {
  return makeWrappedDataFunction(origAction, 'loader');
}

function wrapRequestHandler(origRequestHandler: RequestHandler): RequestHandler {
  return async function (this: unknown, request: Request, loadContext?: unknown): Promise<Response> {
    const hub = getCurrentHub();
    const currentScope = hub.getScope();
    const transaction = hub.startTransaction({
      name: stripUrlQueryAndFragment(request.url),
      op: 'http.server',
      tags: {
        method: request.method,
      },
      metadata: {
        source: 'url',
      },
    });

    if (transaction) {
      currentScope?.setSpan(transaction);
    }

    const res = (await origRequestHandler.call(this, request, loadContext)) as Response;

    transaction?.setHttpStatus(res.status);
    transaction?.finish();

    return res;
  };
}

function makeWrappedCreateRequestHandler(
  origCreateRequestHandler: CreateRequestHandlerFunction,
): CreateRequestHandlerFunction {
  return function (this: unknown, build: ServerBuild, mode: string | undefined): RequestHandler {
    const routes: ServerRouteManifest = {};

    const wrappedEntry = { ...build.entry, module: { ...build.entry.module } };

    fill(wrappedEntry.module, 'default', makeWrappedDocumentRequestFunction);

    for (const [id, route] of Object.entries(build.routes)) {
      const wrappedRoute = { ...route, module: { ...route.module } };

      if (wrappedRoute.module.action) {
        fill(wrappedRoute.module, 'action', makeWrappedAction);
      }

      if (wrappedRoute.module.loader) {
        fill(wrappedRoute.module, 'loader', makeWrappedLoader);
      }

      routes[id] = wrappedRoute;
    }

    const requestHandler = origCreateRequestHandler.call(this, { ...build, routes, entry: wrappedEntry }, mode);

    return wrapRequestHandler(requestHandler);
  };
}

/**
 * Monkey-patch Remix's `createRequestHandler` from `@remix-run/server-runtime`
 * which Remix Adapters (https://remix.run/docs/en/v1/api/remix) use underneath.
 */
export function instrumentServer(): void {
  const pkg = loadModule<{ createRequestHandler: CreateRequestHandlerFunction }>('@remix-run/server-runtime');

  if (!pkg) {
    __DEBUG_BUILD__ && logger.warn('Remix SDK was unable to require `@remix-run/server-runtime` package.');

    return;
  }

  fill(pkg, 'createRequestHandler', makeWrappedCreateRequestHandler);
}
