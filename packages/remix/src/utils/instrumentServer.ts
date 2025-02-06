import type { RequestEventData, WrappedFunction } from '@sentry/core';
import {
  continueTrace,
  fill,
  getClient,
  getTraceData,
  hasSpansEnabled,
  isNodeEnv,
  loadModule,
  logger,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { captureRemixServerException, errorHandleDataFunction, errorHandleDocumentRequestFunction } from './errors';
import { extractData, isDeferredData, isResponse, isRouteErrorResponse, json } from './vendor/response';
import type {
  AppData,
  AppLoadContext,
  CreateRequestHandlerFunction,
  DataFunction,
  DataFunctionArgs,
  EntryContext,
  HandleDocumentRequestFunction,
  RemixRequest,
  RequestHandler,
  ServerBuild,
  ServerRouteManifest,
} from './vendor/types';

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
function isRedirectResponse(response: Response): boolean {
  return redirectStatusCodes.has(response.status);
}

function isCatchResponse(response: Response): boolean {
  return response.headers.get('X-Remix-Catch') != null;
}

/**
 * Sentry utility to be used in place of `handleError` function of Remix v2
 * Remix Docs: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
 *
 * Should be used in `entry.server` like:
 *
 * export const handleError = Sentry.sentryHandleError
 */
export function sentryHandleError(err: unknown, { request }: DataFunctionArgs): void {
  // We are skipping thrown responses here as they are handled by
  // `captureRemixServerException` at loader / action level
  // We don't want to capture them twice.
  // This function is only for capturing unhandled server-side exceptions.
  // https://remix.run/docs/en/main/file-conventions/entry.server#thrown-responses
  if (isResponse(err) || isRouteErrorResponse(err)) {
    return;
  }

  captureRemixServerException(err, 'remix.server.handleError', request).then(null, e => {
    DEBUG_BUILD && logger.warn('Failed to capture Remix Server exception.', e);
  });
}

/**
 * Sentry wrapper for Remix's `handleError` function.
 * Remix Docs: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
 */
export function wrapHandleErrorWithSentry(
  origHandleError: (err: unknown, args: { request: unknown }) => void,
): (err: unknown, args: { request: unknown }) => void {
  return function (this: unknown, err: unknown, args: { request: unknown }): void {
    // This is expected to be void but just in case it changes in the future.
    const res = origHandleError.call(this, err, args);

    sentryHandleError(err, args as DataFunctionArgs);

    return res;
  };
}

function getTraceAndBaggage(): {
  sentryTrace?: string;
  sentryBaggage?: string;
} {
  if (isNodeEnv()) {
    const traceData = getTraceData();

    return {
      sentryTrace: traceData['sentry-trace'],
      sentryBaggage: traceData.baggage,
    };
  }

  return {};
}

function makeWrappedDocumentRequestFunction() {
  return function (origDocumentRequestFunction: HandleDocumentRequestFunction): HandleDocumentRequestFunction {
    return async function (
      this: unknown,
      request: Request,
      responseStatusCode: number,
      responseHeaders: Headers,
      context: EntryContext,
      loadContext?: Record<string, unknown>,
    ): Promise<Response> {
      return errorHandleDocumentRequestFunction.call(this, origDocumentRequestFunction, {
        request,
        responseStatusCode,
        responseHeaders,
        context,
        loadContext,
      });
    };
  };
}

function makeWrappedDataFunction(origFn: DataFunction, id: string, name: 'action' | 'loader'): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    return errorHandleDataFunction.call(this, origFn, name, args);
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

function makeWrappedRootLoader() {
  return function (origLoader: DataFunction): DataFunction {
    return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
      const res = await origLoader.call(this, args);
      const traceAndBaggage = getTraceAndBaggage();

      if (isDeferredData(res)) {
        res.data['sentryTrace'] = traceAndBaggage.sentryTrace;
        res.data['sentryBaggage'] = traceAndBaggage.sentryBaggage;

        return res;
      }

      if (isResponse(res)) {
        // Note: `redirect` and `catch` responses do not have bodies to extract.
        // We skip injection of trace and baggage in those cases.
        // For `redirect`, a valid internal redirection target will have the trace and baggage injected.
        if (isRedirectResponse(res) || isCatchResponse(res)) {
          DEBUG_BUILD && logger.warn('Skipping injection of trace and baggage as the response does not have a body');
          return res;
        } else {
          const data = await extractData(res);

          if (typeof data === 'object') {
            return json(
              { ...data, ...traceAndBaggage },
              {
                headers: res.headers,
                statusText: res.statusText,
                status: res.status,
              },
            );
          } else {
            DEBUG_BUILD && logger.warn('Skipping injection of trace and baggage as the response body is not an object');
            return res;
          }
        }
      }

      return { ...res, ...traceAndBaggage };
    };
  };
}

function wrapRequestHandler(origRequestHandler: RequestHandler): RequestHandler {
  return async function (this: unknown, request: RemixRequest, loadContext?: AppLoadContext): Promise<Response> {
    const upperCaseMethod = request.method.toUpperCase();
    // We don't want to wrap OPTIONS and HEAD requests
    if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
      return origRequestHandler.call(this, request, loadContext);
    }

    return withIsolationScope(async isolationScope => {
      const options = getClient()?.getOptions();

      let normalizedRequest: RequestEventData = {};

      try {
        normalizedRequest = winterCGRequestToRequestData(request);
      } catch (e) {
        DEBUG_BUILD && logger.warn('Failed to normalize Remix request');
      }

      isolationScope.setSDKProcessingMetadata({ normalizedRequest });

      if (!options || !hasSpansEnabled(options)) {
        return origRequestHandler.call(this, request, loadContext);
      }

      return continueTrace(
        {
          sentryTrace: request.headers.get('sentry-trace') || '',
          baggage: request.headers.get('baggage') || '',
        },
        async () => {
          return (await origRequestHandler.call(this, request, loadContext)) as Response;
        },
      );
    });
  };
}

function instrumentBuildCallback(build: ServerBuild): ServerBuild {
  const routes: ServerRouteManifest = {};
  const wrappedEntry = { ...build.entry, module: { ...build.entry.module } };

  // Not keeping boolean flags like it's done for `requestHandler` functions,
  // Because the build can change between build and runtime.
  // So if there is a new `loader` or`action` or `documentRequest` after build.
  // We should be able to wrap them, as they may not be wrapped before.
  const defaultExport = wrappedEntry.module.default as undefined | WrappedFunction;
  if (defaultExport && !defaultExport.__sentry_original__) {
    fill(wrappedEntry.module, 'default', makeWrappedDocumentRequestFunction());
  }

  for (const [id, route] of Object.entries(build.routes)) {
    const wrappedRoute = { ...route, module: { ...route.module } };

    const routeAction = wrappedRoute.module.action as undefined | WrappedFunction;
    if (routeAction && !routeAction.__sentry_original__) {
      fill(wrappedRoute.module, 'action', makeWrappedAction(id));
    }

    const routeLoader = wrappedRoute.module.loader as undefined | WrappedFunction;
    if (routeLoader && !routeLoader.__sentry_original__) {
      fill(wrappedRoute.module, 'loader', makeWrappedLoader(id));
    }

    // Entry module should have a loader function to provide `sentry-trace` and `baggage`
    // They will be available for the root `meta` function as `data.sentryTrace` and `data.sentryBaggage`
    if (!wrappedRoute.parentId) {
      if (!wrappedRoute.module.loader) {
        wrappedRoute.module.loader = () => ({});
      }

      // We want to wrap the root loader regardless of whether it's already wrapped before.
      fill(wrappedRoute.module, 'loader', makeWrappedRootLoader());
    }

    routes[id] = wrappedRoute;
  }

  return { ...build, routes, entry: wrappedEntry };
}

/**
 * Instruments `remix` ServerBuild for performance tracing and error tracking.
 */
export function instrumentBuild(
  build: ServerBuild | (() => ServerBuild | Promise<ServerBuild>),
): ServerBuild | (() => ServerBuild | Promise<ServerBuild>) {
  if (typeof build === 'function') {
    return function () {
      const resolvedBuild = build();

      if (resolvedBuild instanceof Promise) {
        return resolvedBuild.then(build => {
          return instrumentBuildCallback(build);
        });
      } else {
        return instrumentBuildCallback(resolvedBuild);
      }
    };
  } else {
    return instrumentBuildCallback(build);
  }
}

const makeWrappedCreateRequestHandler = () =>
  function (origCreateRequestHandler: CreateRequestHandlerFunction): CreateRequestHandlerFunction {
    return function (
      this: unknown,
      build: ServerBuild | (() => Promise<ServerBuild>),
      ...args: unknown[]
    ): RequestHandler {
      const newBuild = instrumentBuild(build);
      const requestHandler = origCreateRequestHandler.call(this, newBuild, ...args);

      return wrapRequestHandler(requestHandler);
    };
  };

/**
 * Monkey-patch Remix's `createRequestHandler` from `@remix-run/server-runtime`
 * which Remix Adapters (https://remix.run/docs/en/v1/api/remix) use underneath.
 */
export function instrumentServer(): void {
  const pkg = loadModule<{
    createRequestHandler: CreateRequestHandlerFunction;
  }>('@remix-run/server-runtime', module);

  if (!pkg) {
    DEBUG_BUILD && logger.warn('Remix SDK was unable to require `@remix-run/server-runtime` package.');

    return;
  }

  fill(pkg, 'createRequestHandler', makeWrappedCreateRequestHandler());
}
