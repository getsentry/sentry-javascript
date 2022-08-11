/* eslint-disable max-lines */
import { captureException, getCurrentHub } from '@sentry/node';
import { getActiveTransaction, hasTracingEnabled } from '@sentry/tracing';
import { addExceptionMechanism, fill, isNodeEnv, loadModule, logger, serializeBaggage } from '@sentry/utils';

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
interface RouteData {
  [routeId: string]: AppData;
}

interface MetaFunction {
  (args: { data: AppData; parentsData: RouteData; params: Params; location: Location }): HtmlMetaDescriptor;
}

interface HtmlMetaDescriptor {
  [name: string]: null | string | undefined | Record<string, string> | Array<Record<string, string> | string>;
  charset?: 'utf-8';
  charSet?: 'utf-8';
  title?: string;
}

interface ServerRouteModule {
  action?: DataFunction;
  headers?: unknown;
  loader?: DataFunction;
  meta?: MetaFunction | HtmlMetaDescriptor;
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
  meta: MetaFunction;
  loader: DataFunction;
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

interface ReactRouterDomPkg {
  matchRoutes: (routes: ServerRoute[], pathname: string) => RouteMatch<ServerRoute>[] | null;
}

// Taken from Remix Implementation
// https://github.com/remix-run/remix/blob/97999d02493e8114c39d48b76944069d58526e8d/packages/remix-server-runtime/routeMatching.ts#L6-L10
export interface RouteMatch<Route> {
  params: Params;
  pathname: string;
  route: Route;
}

// Taken from Remix Implementation
// https://github.com/remix-run/remix/blob/32300ec6e6e8025602cea63e17a2201989589eab/packages/remix-server-runtime/responses.ts#L60-L77
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isResponse(value: any): value is Response {
  return (
    value != null &&
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    typeof value.status === 'number' &&
    typeof value.statusText === 'string' &&
    typeof value.headers === 'object' &&
    typeof value.body !== 'undefined'
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  );
}

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
function isRedirectResponse(response: Response): boolean {
  return redirectStatusCodes.has(response.status);
}

function isCatchResponse(response: Response): boolean {
  return response.headers.get('X-Remix-Catch') != null;
}

// Based on Remix Implementation
// https://github.com/remix-run/remix/blob/7688da5c75190a2e29496c78721456d6e12e3abe/packages/remix-server-runtime/data.ts#L131-L145
function extractData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type');

  // Cloning the response to avoid consuming the original body stream
  const responseClone = response.clone();

  if (contentType && /\bapplication\/json\b/.test(contentType)) {
    return responseClone.json();
  }

  return responseClone.text();
}

function captureRemixServerException(err: Error, name: string): void {
  // Skip capturing if the thrown error is not a 5xx response
  // https://remix.run/docs/en/v1/api/conventions#throwing-responses-in-loaders
  if (isResponse(err) && err.status < 500) {
    return;
  }

  captureException(isResponse(err) ? extractData(err) : err, scope => {
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

function makeWrappedDataFunction(origFn: DataFunction, id: string, name: 'action' | 'loader'): DataFunction {
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
        description: id,
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

const makeWrappedAction =
  (id: string) =>
  (origAction: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origAction, id, 'action');
  };

const makeWrappedLoader =
  (id: string) =>
  (origLoader: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origLoader, id, 'loader');
  };

function getTraceAndBaggage(): { sentryTrace?: string; sentryBaggage?: string } {
  const transaction = getActiveTransaction();
  const currentScope = getCurrentHub().getScope();

  if (isNodeEnv() && hasTracingEnabled()) {
    if (currentScope) {
      const span = currentScope.getSpan();

      if (span && transaction) {
        return {
          sentryTrace: span.toTraceparent(),
          sentryBaggage: serializeBaggage(transaction.getBaggage()),
        };
      }
    }
  }

  return {};
}

// https://github.com/remix-run/remix/blob/7688da5c75190a2e29496c78721456d6e12e3abe/packages/remix-server-runtime/responses.ts#L1-L4
export type JsonFunction = <Data>(data: Data, init?: number | ResponseInit) => Response;

/**
 * This is a shortcut for creating `application/json` responses. Converts `data`
 * to JSON and sets the `Content-Type` header.
 *
 * @see https://remix.run/api/remix#json
 *
 * https://github.com/remix-run/remix/blob/7688da5c75190a2e29496c78721456d6e12e3abe/packages/remix-server-runtime/responses.ts#L12-L24
 */
const json: JsonFunction = (data, init = {}) => {
  const responseInit = typeof init === 'number' ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers,
  });
};

function makeWrappedRootLoader(origLoader: DataFunction): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    const res = await origLoader.call(this, args);
    const traceAndBaggage = getTraceAndBaggage();

    // Note: `redirect` and `catch` responses do not have bodies to extract
    if (isResponse(res) && !isRedirectResponse(res) && !isCatchResponse(res)) {
      const data = await extractData(res);
      if (typeof data === 'object') {
        return json(
          { ...data, ...traceAndBaggage },
          { headers: res.headers, statusText: res.statusText, status: res.status },
        );
      } else {
        __DEBUG_BUILD__ && logger.warn('Skipping injection of trace and baggage as the response body is not an object');
        return res;
      }
    }

    return { ...res, ...traceAndBaggage };
  };
}

function createRoutes(manifest: ServerRouteManifest, parentId?: string): ServerRoute[] {
  return Object.entries(manifest)
    .filter(([, route]) => route.parentId === parentId)
    .map(([id, route]) => ({
      ...route,
      children: createRoutes(manifest, id),
    }));
}

// Remix Implementation:
// https://github.com/remix-run/remix/blob/38e127b1d97485900b9c220d93503de0deb1fc81/packages/remix-server-runtime/routeMatching.ts#L12-L24
//
// Changed so that `matchRoutes` function is passed in.
function matchServerRoutes(
  routes: ServerRoute[],
  pathname: string,
  pkg?: ReactRouterDomPkg,
): RouteMatch<ServerRoute>[] | null {
  if (!pkg) {
    return null;
  }

  const matches = pkg.matchRoutes(routes, pathname);
  if (!matches) {
    return null;
  }

  return matches.map(match => ({
    params: match.params,
    pathname: match.pathname,
    route: match.route,
  }));
}

function wrapRequestHandler(origRequestHandler: RequestHandler, build: ServerBuild): RequestHandler {
  const routes = createRoutes(build.routes);
  const pkg = loadModule<ReactRouterDomPkg>('react-router-dom');
  return async function (this: unknown, request: Request, loadContext?: unknown): Promise<Response> {
    const hub = getCurrentHub();
    const currentScope = hub.getScope();

    const url = new URL(request.url);
    const matches = matchServerRoutes(routes, url.pathname, pkg);

    const match = matches && getRequestMatch(url, matches);
    const name = match === null ? url.pathname : match.route.id;
    const source = match === null ? 'url' : 'route';
    const transaction = hub.startTransaction({
      name,
      op: 'http.server',
      tags: {
        method: request.method,
      },
      metadata: {
        source,
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

// https://github.com/remix-run/remix/blob/97999d02493e8114c39d48b76944069d58526e8d/packages/remix-server-runtime/server.ts#L573-L586
function isIndexRequestUrl(url: URL): boolean {
  for (const param of url.searchParams.getAll('index')) {
    // only use bare `?index` params without a value
    // ✅ /foo?index
    // ✅ /foo?index&index=123
    // ✅ /foo?index=123&index
    // ❌ /foo?index=123
    if (param === '') {
      return true;
    }
  }

  return false;
}

// https://github.com/remix-run/remix/blob/97999d02493e8114c39d48b76944069d58526e8d/packages/remix-server-runtime/server.ts#L588-L596
function getRequestMatch(url: URL, matches: RouteMatch<ServerRoute>[]): RouteMatch<ServerRoute> {
  const match = matches.slice(-1)[0];

  if (!isIndexRequestUrl(url) && match.route.id.endsWith('/index')) {
    return matches.slice(-2)[0];
  }

  return match;
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
        fill(wrappedRoute.module, 'action', makeWrappedAction(id));
      }

      if (wrappedRoute.module.loader) {
        fill(wrappedRoute.module, 'loader', makeWrappedLoader(id));
      }

      // Entry module should have a loader function to provide `sentry-trace` and `baggage`
      // They will be available for the root `meta` function as `data.sentryTrace` and `data.sentryBaggage`
      if (!wrappedRoute.parentId) {
        if (!wrappedRoute.module.loader) {
          wrappedRoute.module.loader = () => ({});
        }

        fill(wrappedRoute.module, 'loader', makeWrappedRootLoader);
      }

      routes[id] = wrappedRoute;
    }

    const newBuild = { ...build, routes, entry: wrappedEntry };

    const requestHandler = origCreateRequestHandler.call(this, newBuild, mode);

    return wrapRequestHandler(requestHandler, newBuild);
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
