/* eslint-disable max-lines */
import type { AgnosticRouteObject } from '@remix-run/router';
import { isDeferredData, isRouteErrorResponse } from '@remix-run/router';
import type {
  ActionFunction,
  ActionFunctionArgs,
  AppLoadContext,
  CreateRequestHandlerFunction,
  HandleDocumentRequestFunction,
  LoaderFunction,
  LoaderFunctionArgs,
  RequestHandler,
  ServerBuild,
} from '@remix-run/server-runtime';
import type { RequestEventData, Span, TransactionSource, WrappedFunction } from '@sentry/core';
import {
  continueTrace,
  debug,
  fill,
  getActiveSpan,
  getClient,
  getRootSpan,
  getTraceData,
  hasSpansEnabled,
  httpHeadersToSpanAttributes,
  isNodeEnv,
  loadModule,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  spanToJSON,
  startSpan,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';
import { createRoutes, getTransactionName } from '../utils/utils';
import { extractData, isResponse, json } from '../utils/vendor/response';
import { captureRemixServerException, errorHandleDataFunction } from './errors';

type AppData = unknown;
type RemixRequest = Parameters<RequestHandler>[0];
type ServerRouteManifest = ServerBuild['routes'];
type DataFunction = LoaderFunction | ActionFunction;
type DataFunctionArgs = LoaderFunctionArgs | ActionFunctionArgs;

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
    DEBUG_BUILD && debug.warn('Failed to capture Remix Server exception.', e);
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

function isCloudflareEnv(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return navigator?.userAgent?.includes('Cloudflare');
}

function getTraceAndBaggage(): {
  sentryTrace?: string;
  sentryBaggage?: string;
} {
  if (isNodeEnv() || isCloudflareEnv()) {
    const traceData = getTraceData();

    return {
      sentryTrace: traceData['sentry-trace'],
      sentryBaggage: traceData.baggage,
    };
  }

  return {};
}

function makeWrappedDocumentRequestFunction(instrumentTracing?: boolean) {
  return function (origDocumentRequestFunction: HandleDocumentRequestFunction): HandleDocumentRequestFunction {
    return async function (this: unknown, request: Request, ...args: unknown[]): Promise<Response> {
      if (instrumentTracing) {
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
            return origDocumentRequestFunction.call(this, request, ...args);
          },
        );
      } else {
        return origDocumentRequestFunction.call(this, request, ...args);
      }
    };
  };
}

/**
 * Updates the root span name with the parameterized route name.
 * This is necessary for runtimes like Cloudflare Workers/Hydrogen where
 * the request handler is not wrapped by Remix's wrapRequestHandler.
 */
function updateSpanWithRoute(args: DataFunctionArgs, build: ServerBuild): void {
  try {
    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);

    if (!rootSpan) {
      return;
    }

    const routes = createRoutes(build.routes);
    const url = new URL(args.request.url);
    const [transactionName] = getTransactionName(routes, url);

    // Preserve the HTTP method prefix if the span already has one
    const method = args.request.method.toUpperCase();
    const currentSpanName = spanToJSON(rootSpan).description;
    const newSpanName = currentSpanName?.startsWith(method) ? `${method} ${transactionName}` : transactionName;

    rootSpan.updateName(newSpanName);
  } catch (e) {
    DEBUG_BUILD && debug.warn('Failed to update span name with route', e);
  }
}

function makeWrappedDataFunction(
  origFn: DataFunction,
  id: string,
  name: 'action' | 'loader',
  instrumentTracing?: boolean,
  build?: ServerBuild,
): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    if (instrumentTracing) {
      // Update span name for Cloudflare Workers/Hydrogen environments
      if (build) {
        updateSpanWithRoute(args, build);
      }

      return startSpan(
        {
          op: `function.remix.${name}`,
          name: id,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.remix',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `function.remix.${name}`,
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
  (id: string, instrumentTracing?: boolean, build?: ServerBuild) =>
  (origAction: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origAction, id, 'action', instrumentTracing, build);
  };

const makeWrappedLoader =
  (id: string, instrumentTracing?: boolean, build?: ServerBuild) =>
  (origLoader: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origLoader, id, 'loader', instrumentTracing, build);
  };

function makeWrappedRootLoader(instrumentTracing?: boolean, build?: ServerBuild) {
  return function (origLoader: DataFunction): DataFunction {
    return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
      // Update span name for Cloudflare Workers/Hydrogen environments
      // The root loader always runs, even for routes that don't have their own loaders
      if (instrumentTracing && build) {
        updateSpanWithRoute(args, build);
      }

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
          DEBUG_BUILD && debug.warn('Skipping injection of trace and baggage as the response does not have a body');
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
            DEBUG_BUILD && debug.warn('Skipping injection of trace and baggage as the response body is not an object');
            return res;
          }
        }
      }

      return { ...res, ...traceAndBaggage };
    };
  };
}

function wrapRequestHandler<T extends ServerBuild | (() => ServerBuild | Promise<ServerBuild>)>(
  origRequestHandler: RequestHandler,
  build: T,
  options?: {
    instrumentTracing?: boolean;
  },
): RequestHandler {
  let resolvedBuild: ServerBuild | { build: ServerBuild };
  let name: string;
  let source: TransactionSource;

  return async function (this: unknown, request: RemixRequest, loadContext?: AppLoadContext): Promise<Response> {
    const upperCaseMethod = request.method.toUpperCase();
    // We don't want to wrap OPTIONS and HEAD requests
    if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
      return origRequestHandler.call(this, request, loadContext);
    }

    let resolvedRoutes: AgnosticRouteObject[] | undefined;

    if (options?.instrumentTracing) {
      if (typeof build === 'function') {
        resolvedBuild = await build();
      } else {
        resolvedBuild = build;
      }

      // check if the build is nested under `build` key
      if ('build' in resolvedBuild) {
        resolvedRoutes = createRoutes((resolvedBuild.build as ServerBuild).routes);
      } else {
        resolvedRoutes = createRoutes(resolvedBuild.routes);
      }
    }

    return withIsolationScope(async isolationScope => {
      const clientOptions = getClient()?.getOptions();

      let normalizedRequest: RequestEventData = {};

      try {
        normalizedRequest = winterCGRequestToRequestData(request);
      } catch {
        DEBUG_BUILD && debug.warn('Failed to normalize Remix request');
      }

      if (options?.instrumentTracing && resolvedRoutes) {
        const url = new URL(request.url);
        [name, source] = getTransactionName(resolvedRoutes, url);

        isolationScope.setTransactionName(name);

        // Update the span name if we're running inside an existing span
        const parentSpan = getActiveSpan();
        if (parentSpan) {
          const rootSpan = getRootSpan(parentSpan);
          rootSpan?.updateName(name);
        }
      }

      isolationScope.setSDKProcessingMetadata({ normalizedRequest });

      if (!clientOptions || !hasSpansEnabled(clientOptions)) {
        return origRequestHandler.call(this, request, loadContext);
      }

      return continueTrace(
        {
          sentryTrace: request.headers.get('sentry-trace') || '',
          baggage: request.headers.get('baggage') || '',
        },
        async () => {
          if (options?.instrumentTracing) {
            const parentSpan = getActiveSpan();
            const rootSpan = parentSpan && getRootSpan(parentSpan);
            rootSpan?.updateName(name);

            return startSpan(
              {
                name,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.remix',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                  method: request.method,
                  ...httpHeadersToSpanAttributes(
                    winterCGHeadersToDict(request.headers),
                    clientOptions.sendDefaultPii ?? false,
                  ),
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

function instrumentBuildCallback(
  build: ServerBuild,
  options?: {
    instrumentTracing?: boolean;
  },
): ServerBuild {
  const routes: ServerRouteManifest = build.routes;

  const wrappedEntry = { ...build.entry, module: { ...build.entry.module } };

  // Not keeping boolean flags like it's done for `requestHandler` functions,
  // Because the build can change between build and runtime.
  // So if there is a new `loader` or`action` or `documentRequest` after build.
  // We should be able to wrap them, as they may not be wrapped before.
  const defaultExport = wrappedEntry.module.default as undefined | WrappedFunction;
  if (defaultExport && !defaultExport.__sentry_original__) {
    fill(wrappedEntry.module, 'default', makeWrappedDocumentRequestFunction(options?.instrumentTracing));
  }

  for (const [id, route] of Object.entries(build.routes)) {
    const wrappedRoute = { ...route, module: { ...route.module } };

    // Entry module should have a loader function to provide `sentry-trace` and `baggage`
    // They will be available for the root `meta` function as `data.sentryTrace` and `data.sentryBaggage`
    if (!wrappedRoute.parentId) {
      if (!wrappedRoute.module.loader) {
        wrappedRoute.module.loader = () => ({});
      }

      if (!(wrappedRoute.module.loader as WrappedFunction).__sentry_original__) {
        fill(wrappedRoute.module, 'loader', makeWrappedRootLoader(options?.instrumentTracing, build));
      }
    }

    const routeAction = wrappedRoute.module.action as undefined | WrappedFunction;
    if (routeAction && !routeAction.__sentry_original__) {
      fill(wrappedRoute.module, 'action', makeWrappedAction(id, options?.instrumentTracing, build));
    }

    const routeLoader = wrappedRoute.module.loader as undefined | WrappedFunction;
    if (routeLoader && !routeLoader.__sentry_original__) {
      fill(wrappedRoute.module, 'loader', makeWrappedLoader(id, options?.instrumentTracing, build));
    }

    routes[id] = wrappedRoute;
  }

  const instrumentedBuild = { ...build, routes };

  if (wrappedEntry) {
    instrumentedBuild.entry = wrappedEntry;
  }

  return instrumentedBuild;
}

/**
 * Instruments `remix` ServerBuild for performance tracing and error tracking.
 */
export function instrumentBuild<T extends ServerBuild | (() => ServerBuild | Promise<ServerBuild>)>(
  build: T,
  options?: {
    instrumentTracing?: boolean;
  },
): T {
  if (typeof build === 'function') {
    return function () {
      const resolvedBuild = build();

      if (resolvedBuild instanceof Promise) {
        return resolvedBuild.then(build => {
          return instrumentBuildCallback(build, options);
        });
      } else {
        return instrumentBuildCallback(resolvedBuild, options);
      }
    } as T;
  } else {
    return instrumentBuildCallback(build, options) as T;
  }
}

export const makeWrappedCreateRequestHandler = (options?: { instrumentTracing?: boolean }) =>
  function (origCreateRequestHandler: CreateRequestHandlerFunction): CreateRequestHandlerFunction {
    return function (this: unknown, build, ...args: unknown[]): RequestHandler {
      const newBuild = instrumentBuild(build, options);
      const requestHandler = origCreateRequestHandler.call(this, newBuild, ...args);

      return wrapRequestHandler(requestHandler, newBuild, options);
    };
  };

/**
 * Monkey-patch Remix's `createRequestHandler` from `@remix-run/server-runtime`
 * which Remix Adapters (https://remix.run/docs/en/v1/api/remix) use underneath.
 */
export function instrumentServer(options?: { instrumentTracing?: boolean }): void {
  const pkg = loadModule<{
    createRequestHandler: CreateRequestHandlerFunction;
  }>('@remix-run/server-runtime', module);

  if (!pkg) {
    DEBUG_BUILD && debug.warn('Remix SDK was unable to require `@remix-run/server-runtime` package.');

    return;
  }

  fill(pkg, 'createRequestHandler', makeWrappedCreateRequestHandler(options));
}
