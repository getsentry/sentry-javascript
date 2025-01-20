/* eslint-disable max-lines */
import type { RequestEventData, Span, TransactionSource, WrappedFunction } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  continueTrace,
  fill,
  getActiveSpan,
  getClient,
  getRootSpan,
  getTraceData,
  hasTracingEnabled,
  isNodeEnv,
  loadModule,
  logger,
  setHttpStatus,
  spanToJSON,
  startSpan,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { captureRemixServerException, errorHandleDataFunction, errorHandleDocumentRequestFunction } from './errors';
import type { RemixOptions } from './remixOptions';
import { createRoutes, getTransactionName } from './utils';
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
  ServerRoute,
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

function makeWrappedDocumentRequestFunction(autoInstrumentRemix?: boolean) {
  return function (origDocumentRequestFunction: HandleDocumentRequestFunction): HandleDocumentRequestFunction {
    return async function (
      this: unknown,
      request: Request,
      responseStatusCode: number,
      responseHeaders: Headers,
      context: EntryContext,
      loadContext?: Record<string, unknown>,
    ): Promise<Response> {
      const documentRequestContext = {
        request,
        responseStatusCode,
        responseHeaders,
        context,
        loadContext,
      };

      if (!autoInstrumentRemix) {
        const activeSpan = getActiveSpan();
        const rootSpan = activeSpan && getRootSpan(activeSpan);

        const name = rootSpan ? spanToJSON(rootSpan).description : undefined;

        return startSpan(
          {
            // If we don't have a root span, `onlyIfParent` will lead to the span not being created anyhow
            // So we don't need to care too much about the fallback name, it's just for typing purposes....
            name: name || '<unknown>',
            onlyIfParent: true,
            attributes: {
              method: request.method,
              url: request.url,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.remix',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.remix.document_request',
            },
          },
          () => {
            return errorHandleDocumentRequestFunction.call(this, origDocumentRequestFunction, documentRequestContext);
          },
        );
      } else {
        return errorHandleDocumentRequestFunction.call(this, origDocumentRequestFunction, documentRequestContext);
      }
    };
  };
}

function makeWrappedDataFunction(
  origFn: DataFunction,
  id: string,
  name: 'action' | 'loader',
  autoInstrumentRemix?: boolean,
): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    if (!autoInstrumentRemix) {
      return startSpan(
        {
          op: `function.remix.${name}`,
          name: id,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.remix',
            name,
          },
        },
        (span: Span) => {
          return errorHandleDataFunction.call(this, origFn, name, args, span);
        },
      );
    } else {
      return errorHandleDataFunction.call(this, origFn, name, args);
    }
  };
}

const makeWrappedAction =
  (id: string, autoInstrumentRemix?: boolean) =>
  (origAction: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origAction, id, 'action', autoInstrumentRemix);
  };

const makeWrappedLoader =
  (id: string, autoInstrumentRemix?: boolean) =>
  (origLoader: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origLoader, id, 'loader', autoInstrumentRemix);
  };

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

function wrapRequestHandler(
  origRequestHandler: RequestHandler,
  build: ServerBuild | (() => ServerBuild | Promise<ServerBuild>),
  autoInstrumentRemix: boolean,
): RequestHandler {
  let resolvedBuild: ServerBuild;
  let routes: ServerRoute[];
  let name: string;
  let source: TransactionSource;

  return async function (this: unknown, request: RemixRequest, loadContext?: AppLoadContext): Promise<Response> {
    const upperCaseMethod = request.method.toUpperCase();
    // We don't want to wrap OPTIONS and HEAD requests
    if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
      return origRequestHandler.call(this, request, loadContext);
    }

    if (!autoInstrumentRemix) {
      if (typeof build === 'function') {
        resolvedBuild = await build();
      } else {
        resolvedBuild = build;
      }

      routes = createRoutes(resolvedBuild.routes);
    }

    return withIsolationScope(async isolationScope => {
      const options = getClient()?.getOptions();

      let normalizedRequest: RequestEventData = {};

      try {
        normalizedRequest = winterCGRequestToRequestData(request);
      } catch (e) {
        DEBUG_BUILD && logger.warn('Failed to normalize Remix request');
      }

      if (!autoInstrumentRemix) {
        const url = new URL(request.url);
        [name, source] = getTransactionName(routes, url);

        isolationScope.setTransactionName(name);
      }

      isolationScope.setSDKProcessingMetadata({ normalizedRequest });

      if (!options || !hasTracingEnabled(options)) {
        return origRequestHandler.call(this, request, loadContext);
      }

      return continueTrace(
        {
          sentryTrace: request.headers.get('sentry-trace') || '',
          baggage: request.headers.get('baggage') || '',
        },
        async () => {
          if (!autoInstrumentRemix) {
            return startSpan(
              {
                name,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.remix',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                  method: request.method,
                },
              },
              async span => {
                const res = (await origRequestHandler.call(this, request, loadContext)) as Response;

                if (isResponse(res)) {
                  setHttpStatus(span, res.status);
                }

                return res;
              },
            );
          }

          return (await origRequestHandler.call(this, request, loadContext)) as Response;
        },
      );
    });
  };
}

function instrumentBuildCallback(build: ServerBuild, autoInstrumentRemix: boolean): ServerBuild {
  const routes: ServerRouteManifest = {};
  const wrappedEntry = { ...build.entry, module: { ...build.entry.module } };

  // Not keeping boolean flags like it's done for `requestHandler` functions,
  // Because the build can change between build and runtime.
  // So if there is a new `loader` or`action` or `documentRequest` after build.
  // We should be able to wrap them, as they may not be wrapped before.
  const defaultExport = wrappedEntry.module.default as undefined | WrappedFunction;
  if (defaultExport && !defaultExport.__sentry_original__) {
    fill(wrappedEntry.module, 'default', makeWrappedDocumentRequestFunction(autoInstrumentRemix));
  }

  for (const [id, route] of Object.entries(build.routes)) {
    const wrappedRoute = { ...route, module: { ...route.module } };

    const routeAction = wrappedRoute.module.action as undefined | WrappedFunction;
    if (routeAction && !routeAction.__sentry_original__) {
      fill(wrappedRoute.module, 'action', makeWrappedAction(id, autoInstrumentRemix));
    }

    const routeLoader = wrappedRoute.module.loader as undefined | WrappedFunction;
    if (routeLoader && !routeLoader.__sentry_original__) {
      fill(wrappedRoute.module, 'loader', makeWrappedLoader(id, autoInstrumentRemix));
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
  options: RemixOptions,
): ServerBuild | (() => ServerBuild | Promise<ServerBuild>) {
  // eslint-disable-next-line deprecation/deprecation
  const autoInstrumentRemix = options?.autoInstrumentRemix || false;

  if (typeof build === 'function') {
    return function () {
      const resolvedBuild = build();

      if (resolvedBuild instanceof Promise) {
        return resolvedBuild.then(build => {
          return instrumentBuildCallback(build, autoInstrumentRemix);
        });
      } else {
        return instrumentBuildCallback(resolvedBuild, autoInstrumentRemix);
      }
    };
  } else {
    return instrumentBuildCallback(build, autoInstrumentRemix);
  }
}

const makeWrappedCreateRequestHandler = (options: RemixOptions) =>
  function (origCreateRequestHandler: CreateRequestHandlerFunction): CreateRequestHandlerFunction {
    return function (
      this: unknown,
      build: ServerBuild | (() => Promise<ServerBuild>),
      ...args: unknown[]
    ): RequestHandler {
      const newBuild = instrumentBuild(build, options);
      const requestHandler = origCreateRequestHandler.call(this, newBuild, ...args);

      // eslint-disable-next-line deprecation/deprecation
      return wrapRequestHandler(requestHandler, newBuild, options.autoInstrumentRemix || false);
    };
  };

/**
 * Monkey-patch Remix's `createRequestHandler` from `@remix-run/server-runtime`
 * which Remix Adapters (https://remix.run/docs/en/v1/api/remix) use underneath.
 */
export function instrumentServer(options: RemixOptions): void {
  const pkg = loadModule<{
    createRequestHandler: CreateRequestHandlerFunction;
  }>('@remix-run/server-runtime');

  if (!pkg) {
    DEBUG_BUILD && logger.warn('Remix SDK was unable to require `@remix-run/server-runtime` package.');

    return;
  }

  fill(pkg, 'createRequestHandler', makeWrappedCreateRequestHandler(options));
}
