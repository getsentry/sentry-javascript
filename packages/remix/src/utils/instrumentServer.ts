/* eslint-disable max-lines */
import { getActiveTransaction, hasTracingEnabled, runWithAsyncContext } from '@sentry/core';
import type { Hub } from '@sentry/node';
import { captureException, getCurrentHub } from '@sentry/node';
import type { Transaction, TransactionSource, WrappedFunction } from '@sentry/types';
import {
  addExceptionMechanism,
  dynamicSamplingContextToSentryBaggageHeader,
  fill,
  isNodeEnv,
  loadModule,
  logger,
  tracingContextFromHeaders,
} from '@sentry/utils';

import { getFutureFlagsServer } from './futureFlags';
import { extractData, getRequestMatch, isDeferredData, isResponse, json, matchServerRoutes } from './vendor/response';
import type {
  AppData,
  CreateRequestHandlerFunction,
  DataFunction,
  DataFunctionArgs,
  EntryContext,
  FutureConfig,
  HandleDocumentRequestFunction,
  ReactRouterDomPkg,
  RemixRequest,
  RequestHandler,
  ServerBuild,
  ServerRoute,
  ServerRouteManifest,
} from './vendor/types';
import { normalizeRemixRequest } from './web-fetch';

let FUTURE_FLAGS: FutureConfig | undefined;

// Flag to track if the core request handler is instrumented.
export let isRequestHandlerWrapped = false;

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
function isRedirectResponse(response: Response): boolean {
  return redirectStatusCodes.has(response.status);
}

function isCatchResponse(response: Response): boolean {
  return response.headers.get('X-Remix-Catch') != null;
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

/**
 * Captures an exception happened in the Remix server.
 *
 * @param err The error to capture.
 * @param name The name of the origin function.
 * @param request The request object.
 *
 * @returns A promise that resolves when the exception is captured.
 */
export async function captureRemixServerException(err: unknown, name: string, request: Request): Promise<void> {
  // Skip capturing if the thrown error is not a 5xx response
  // https://remix.run/docs/en/v1/api/conventions#throwing-responses-in-loaders
  if (isResponse(err) && err.status < 500) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let normalizedRequest: Record<string, unknown> = request as unknown as any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    context: EntryContext,
    loadContext?: Record<string, unknown>,
  ): Promise<Response> {
    let res: Response;

    const activeTransaction = getActiveTransaction();
    const currentScope = getCurrentHub().getScope();

    if (!currentScope) {
      return origDocumentRequestFunction.call(this, request, responseStatusCode, responseHeaders, context, loadContext);
    }

    try {
      const span = activeTransaction?.startChild({
        op: 'function.remix.document_request',
        origin: 'auto.ui.remix',
        description: activeTransaction.name,
        tags: {
          method: request.method,
          url: request.url,
        },
      });

      res = await origDocumentRequestFunction.call(
        this,
        request,
        responseStatusCode,
        responseHeaders,
        context,
        loadContext,
      );

      span?.finish();
    } catch (err) {
      if (!FUTURE_FLAGS?.v2_errorBoundary) {
        await captureRemixServerException(err, 'documentRequest', request);
      }

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
        origin: 'auto.ui.remix',
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
      if (!FUTURE_FLAGS?.v2_errorBoundary) {
        await captureRemixServerException(err, name, args.request);
      }

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

function makeWrappedRootLoader(origLoader: DataFunction): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    const res = await origLoader.call(this, args);
    const traceAndBaggage = getTraceAndBaggage();

    if (isDeferredData(res)) {
      return {
        ...res.data,
        ...traceAndBaggage,
      };
    }

    if (isResponse(res)) {
      // Note: `redirect` and `catch` responses do not have bodies to extract.
      // We skip injection of trace and baggage in those cases.
      // For `redirect`, a valid internal redirection target will have the trace and baggage injected.
      if (isRedirectResponse(res) || isCatchResponse(res)) {
        __DEBUG_BUILD__ && logger.warn('Skipping injection of trace and baggage as the response does not have a body');
        return res;
      } else {
        const data = await extractData(res);

        if (typeof data === 'object') {
          return json(
            { ...data, ...traceAndBaggage },
            { headers: res.headers, statusText: res.statusText, status: res.status },
          );
        } else {
          __DEBUG_BUILD__ &&
            logger.warn('Skipping injection of trace and baggage as the response body is not an object');
          return res;
        }
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
  const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
    request.headers['sentry-trace'],
    request.headers.baggage,
  );
  hub.getScope().setPropagationContext(propagationContext);

  const transaction = hub.startTransaction({
    name,
    op: 'http.server',
    origin: 'auto.http.remix',
    tags: {
      method: request.method,
    },
    ...traceparentData,
    metadata: {
      source,
      dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
    },
  });

  hub.getScope().setSpan(transaction);
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
    return runWithAsyncContext(async () => {
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
    });
  };
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
    FUTURE_FLAGS = getFutureFlagsServer(build);
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
