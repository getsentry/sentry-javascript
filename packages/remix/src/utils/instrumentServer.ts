/* eslint-disable max-lines */
import type { Hub } from '@sentry/node';
import { captureException, getCurrentHub } from '@sentry/node';
import { getActiveTransaction, hasTracingEnabled } from '@sentry/tracing';
import type { Transaction, TransactionSource, WrappedFunction } from '@sentry/types';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  extractTraceparentData,
  fill,
  isNodeEnv,
  loadModule,
  logger,
} from '@sentry/utils';
import * as domain from 'domain';

import type {
  AppData,
  CreateRequestHandlerFunction,
  DataFunction,
  DataFunctionArgs,
  HandleDocumentRequestFunction,
  ReactRouterDomPkg,
  RemixRequest,
  RequestHandler,
  RouteMatch,
  ServerBuild,
  ServerRoute,
  ServerRouteManifest,
} from './types';
import { normalizeRemixRequest } from './web-fetch';

// Flag to track if the core request handler is instrumented.
export let isRequestHandlerWrapped = false;

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
async function extractData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type');

  // Cloning the response to avoid consuming the original body stream
  const responseClone = response.clone();

  if (contentType && /\bapplication\/json\b/.test(contentType)) {
    return responseClone.json();
  }

  return responseClone.text();
}

async function extractResponseError(response: Response): Promise<unknown> {
  const responseData = await extractData(response);

  if (typeof responseData === 'string') {
    return responseData;
  }

  if (response.statusText) {
    return response.statusText;
  }

  return responseData;
}

async function captureRemixServerException(err: Error, name: string, request: Request): Promise<void> {
  // Skip capturing if the thrown error is not a 5xx response
  // https://remix.run/docs/en/v1/api/conventions#throwing-responses-in-loaders
  if (isResponse(err) && err.status < 500) {
    return;
  }

  let normalizedRequest: Record<string, unknown> = request as unknown as any;

  try {
    normalizedRequest = normalizeRemixRequest(request as unknown as any);
  } catch (e) {
    __DEBUG_BUILD__ && logger.warn('Failed to normalize Remix request');
  }

  captureException(isResponse(err) ? await extractResponseError(err) : err, scope => {
    const activeTransactionName = getActiveTransaction()?.name;

    scope.setSDKProcessingMetadata({
      request: {
        ...normalizedRequest,
        // When `route` is not defined, `RequestData` integration uses the full URL
        route: activeTransactionName
          ? {
              path: activeTransactionName,
            }
          : undefined,
      },
    });

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

    if (!currentScope) {
      return origDocumentRequestFunction.call(this, request, responseStatusCode, responseHeaders, context);
    }

    try {
      const span = activeTransaction?.startChild({
        op: 'function.remix.document_request',
        description: activeTransaction.name,
        tags: {
          method: request.method,
          url: request.url,
        },
      });

      res = await origDocumentRequestFunction.call(this, request, responseStatusCode, responseHeaders, context);

      span?.finish();
    } catch (err) {
      await captureRemixServerException(err, 'documentRequest', request);
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

    if (!currentScope) {
      return origFn.call(this, args);
    }

    try {
      const span = activeTransaction?.startChild({
        op: `function.remix.${name}`,
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
      span?.finish();
    } catch (err) {
      await captureRemixServerException(err, name, args.request);
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
        const dynamicSamplingContext = transaction.getDynamicSamplingContext();

        return {
          sentryTrace: span.toTraceparent(),
          sentryBaggage: dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext),
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

/**
 * Creates routes from the server route manifest
 *
 * @param manifest
 * @param parentId
 */
export function createRoutes(manifest: ServerRouteManifest, parentId?: string): ServerRoute[] {
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

/**
 * Starts a new transaction for the given request to be used by different `RequestHandler` wrappers.
 *
 * @param request
 * @param routes
 * @param pkg
 */
export function startRequestHandlerTransaction(
  hub: Hub,
  name: string,
  source: TransactionSource,
  request: {
    headers: {
      'sentry-trace': string;
      baggage: string;
    };
    method: string;
  },
): Transaction {
  // If there is a trace header set, we extract the data from it (parentSpanId, traceId, and sampling decision)
  const traceparentData = extractTraceparentData(request.headers['sentry-trace']);
  const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(request.headers.baggage);

  const transaction = hub.startTransaction({
    name,
    op: 'http.server',
    tags: {
      method: request.method,
    },
    ...traceparentData,
    metadata: {
      source,
      dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
    },
  });

  hub.getScope()?.setSpan(transaction);
  return transaction;
}

/**
 * Get transaction name from routes and url
 */
export function getTransactionName(
  routes: ServerRoute[],
  url: URL,
  pkg?: ReactRouterDomPkg,
): [string, TransactionSource] {
  const matches = matchServerRoutes(routes, url.pathname, pkg);
  const match = matches && getRequestMatch(url, matches);
  return match === null ? [url.pathname, 'url'] : [match.route.id, 'route'];
}

function wrapRequestHandler(origRequestHandler: RequestHandler, build: ServerBuild): RequestHandler {
  const routes = createRoutes(build.routes);
  const pkg = loadModule<ReactRouterDomPkg>('react-router-dom');

  return async function (this: unknown, request: RemixRequest, loadContext?: unknown): Promise<Response> {
    const local = domain.create();
    return local.bind(async () => {
      const hub = getCurrentHub();
      const options = hub.getClient()?.getOptions();
      const scope = hub.getScope();

      let normalizedRequest: Record<string, unknown> = request;

      try {
        normalizedRequest = normalizeRemixRequest(request);
      } catch (e) {
        __DEBUG_BUILD__ && logger.warn('Failed to normalize Remix request');
      }

      const url = new URL(request.url);
      const [name, source] = getTransactionName(routes, url, pkg);

      if (scope) {
        scope.setSDKProcessingMetadata({
          request: {
            ...normalizedRequest,
            route: {
              path: name,
            },
          },
        });
      }

      if (!options || !hasTracingEnabled(options)) {
        return origRequestHandler.call(this, request, loadContext);
      }

      const transaction = startRequestHandlerTransaction(hub, name, source, {
        headers: {
          'sentry-trace': request.headers.get('sentry-trace') || '',
          baggage: request.headers.get('baggage') || '',
        },
        method: request.method,
      });

      const res = (await origRequestHandler.call(this, request, loadContext)) as Response;

      transaction.setHttpStatus(res.status);
      transaction.finish();

      return res;
    })();
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

/**
 * Instruments `remix` ServerBuild for performance tracing and error tracking.
 */
export function instrumentBuild(build: ServerBuild): ServerBuild {
  const routes: ServerRouteManifest = {};

  const wrappedEntry = { ...build.entry, module: { ...build.entry.module } };

  // Not keeping boolean flags like it's done for `requestHandler` functions,
  // Because the build can change between build and runtime.
  // So if there is a new `loader` or`action` or `documentRequest` after build.
  // We should be able to wrap them, as they may not be wrapped before.
  if (!(wrappedEntry.module.default as WrappedFunction).__sentry_original__) {
    fill(wrappedEntry.module, 'default', makeWrappedDocumentRequestFunction);
  }

  for (const [id, route] of Object.entries(build.routes)) {
    const wrappedRoute = { ...route, module: { ...route.module } };

    if (wrappedRoute.module.action && !(wrappedRoute.module.action as WrappedFunction).__sentry_original__) {
      fill(wrappedRoute.module, 'action', makeWrappedAction(id));
    }

    if (wrappedRoute.module.loader && !(wrappedRoute.module.loader as WrappedFunction).__sentry_original__) {
      fill(wrappedRoute.module, 'loader', makeWrappedLoader(id));
    }

    // Entry module should have a loader function to provide `sentry-trace` and `baggage`
    // They will be available for the root `meta` function as `data.sentryTrace` and `data.sentryBaggage`
    if (!wrappedRoute.parentId) {
      if (!wrappedRoute.module.loader) {
        wrappedRoute.module.loader = () => ({});
      }

      // We want to wrap the root loader regardless of whether it's already wrapped before.
      fill(wrappedRoute.module, 'loader', makeWrappedRootLoader);
    }

    routes[id] = wrappedRoute;
  }

  return { ...build, routes, entry: wrappedEntry };
}

function makeWrappedCreateRequestHandler(
  origCreateRequestHandler: CreateRequestHandlerFunction,
): CreateRequestHandlerFunction {
  // To track if this wrapper has been applied, before other wrappers.
  // Can't track `__sentry_original__` because it's not the same function as the potentially manually wrapped one.
  isRequestHandlerWrapped = true;

  return function (this: unknown, build: ServerBuild, ...args: unknown[]): RequestHandler {
    const newBuild = instrumentBuild(build);
    const requestHandler = origCreateRequestHandler.call(this, newBuild, ...args);

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
