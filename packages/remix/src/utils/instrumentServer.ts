/* eslint-disable max-lines */
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  getActiveSpan,
  getClient,
  getRootSpan,
  handleCallbackErrors,
  hasTracingEnabled,
  setHttpStatus,
  spanToJSON,
  spanToTraceHeader,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { getDynamicSamplingContextFromSpan } from '@sentry/opentelemetry';
import type { Span, TransactionSource, WrappedFunction } from '@sentry/types';
import {
  addExceptionMechanism,
  dynamicSamplingContextToSentryBaggageHeader,
  fill,
  isNodeEnv,
  isPrimitive,
  loadModule,
  logger,
  objectify,
} from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { getFutureFlagsServer, getRemixVersionFromBuild } from './futureFlags';
import {
  extractData,
  getRequestMatch,
  isDeferredData,
  isResponse,
  isRouteErrorResponse,
  json,
  matchServerRoutes,
} from './vendor/response';
import type {
  AppData,
  AppLoadContext,
  CreateRequestHandlerFunction,
  DataFunction,
  DataFunctionArgs,
  EntryContext,
  FutureConfig,
  HandleDocumentRequestFunction,
  RemixRequest,
  RequestHandler,
  ServerBuild,
  ServerRoute,
  ServerRouteManifest,
} from './vendor/types';
import { normalizeRemixRequest } from './web-fetch';

let FUTURE_FLAGS: FutureConfig | undefined;
let IS_REMIX_V2: boolean | undefined;

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
function isRedirectResponse(response: Response): boolean {
  return redirectStatusCodes.has(response.status);
}

function isCatchResponse(response: Response): boolean {
  return response.headers.get('X-Remix-Catch') != null;
}

async function extractResponseError(response: Response): Promise<unknown> {
  const responseData = await extractData(response);

  if (typeof responseData === 'string' && responseData.length > 0) {
    return new Error(responseData);
  }

  if (response.statusText) {
    return new Error(response.statusText);
  }

  return responseData;
}

/**
 * Sentry utility to be used in place of `handleError` function of Remix v2
 * Remix Docs: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
 *
 * Should be used in `entry.server` like:
 *
 * export const handleError = Sentry.wrapRemixHandleError
 */
export function wrapRemixHandleError(err: unknown, { request }: DataFunctionArgs): void {
  // We are skipping thrown responses here as they are handled by
  // `captureRemixServerException` at loader / action level
  // We don't want to capture them twice.
  // This function is only for capturing unhandled server-side exceptions.
  // https://remix.run/docs/en/main/file-conventions/entry.server#thrown-responses
  // https://remix.run/docs/en/v1/api/conventions#throwing-responses-in-loaders
  if (isResponse(err) || isRouteErrorResponse(err)) {
    return;
  }

  captureRemixServerException(err, 'remix.server.handleError', request).then(null, e => {
    DEBUG_BUILD && logger.warn('Failed to capture Remix Server exception.', e);
  });
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
  if (IS_REMIX_V2 && isRouteErrorResponse(err) && err.status < 500) {
    return;
  }

  if (isResponse(err) && err.status < 500) {
    return;
  }
  // Skip capturing if the request is aborted as Remix docs suggest
  // Ref: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
  if (request.signal.aborted) {
    DEBUG_BUILD && logger.warn('Skipping capture of aborted request');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let normalizedRequest: Record<string, unknown> = request as unknown as any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    normalizedRequest = normalizeRemixRequest(request as unknown as any);
  } catch (e) {
    DEBUG_BUILD && logger.warn('Failed to normalize Remix request');
  }

  const objectifiedErr = objectify(err);

  captureException(isResponse(objectifiedErr) ? await extractResponseError(objectifiedErr) : objectifiedErr, scope => {
    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan && getRootSpan(activeSpan);
    const activeRootSpanName = rootSpan ? spanToJSON(rootSpan).description : undefined;

    scope.setSDKProcessingMetadata({
      request: {
        ...normalizedRequest,
        // When `route` is not defined, `RequestData` integration uses the full URL
        route: activeRootSpanName
          ? {
              path: activeRootSpanName,
            }
          : undefined,
      },
    });

    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'instrument',
        handled: false,
        data: {
          function: name,
        },
      });

      return event;
    });

    return scope;
  });
}

function makeWrappedDocumentRequestFunction(remixVersion?: number) {
  return function (origDocumentRequestFunction: HandleDocumentRequestFunction): HandleDocumentRequestFunction {
    return async function (
      this: unknown,
      request: Request,
      responseStatusCode: number,
      responseHeaders: Headers,
      context: EntryContext,
      loadContext?: Record<string, unknown>,
    ): Promise<Response> {
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
          return handleCallbackErrors(
            () => {
              return origDocumentRequestFunction.call(
                this,
                request,
                responseStatusCode,
                responseHeaders,
                context,
                loadContext,
              );
            },
            err => {
              const isRemixV1 = !FUTURE_FLAGS?.v2_errorBoundary && remixVersion !== 2;

              // This exists to capture the server-side rendering errors on Remix v1
              // On Remix v2, we capture SSR errors at `handleError`
              // We also skip primitives here, as we can't dedupe them, and also we don't expect any primitive SSR errors.
              if (isRemixV1 && !isPrimitive(err)) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                captureRemixServerException(err, 'documentRequest', request);
              }
            },
          );
        },
      );
    };
  };
}

function makeWrappedDataFunction(
  origFn: DataFunction,
  id: string,
  name: 'action' | 'loader',
  remixVersion: number,
  manuallyInstrumented: boolean,
): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    if (args.context.__sentry_express_wrapped__ && !manuallyInstrumented) {
      return origFn.call(this, args);
    }

    return startSpan(
      {
        op: `function.remix.${name}`,
        name: id,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.remix',
          name,
        },
      },
      () => {
        return handleCallbackErrors(
          () => origFn.call(this, args),
          err => {
            const isRemixV2 = FUTURE_FLAGS?.v2_errorBoundary || remixVersion === 2;

            // On Remix v2, we capture all unexpected errors (except the `Route Error Response`s / Thrown Responses) in `handleError` function.
            // This is both for consistency and also avoid duplicates such as primitives like `string` or `number` being captured twice.
            // Remix v1 does not have a `handleError` function, so we capture all errors here.
            if (isRemixV2 ? isResponse(err) : true) {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              captureRemixServerException(err, name, args.request);
            }
          },
        );
      },
    );
  };
}

const makeWrappedAction =
  (id: string, remixVersion: number, manuallyInstrumented: boolean) =>
  (origAction: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origAction, id, 'action', remixVersion, manuallyInstrumented);
  };

const makeWrappedLoader =
  (id: string, remixVersion: number, manuallyInstrumented: boolean) =>
  (origLoader: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origLoader, id, 'loader', remixVersion, manuallyInstrumented);
  };

function getTraceAndBaggage(): {
  sentryTrace?: string;
  sentryBaggage?: string;
} {
  if (isNodeEnv() && hasTracingEnabled()) {
    const span = getActiveSpan();
    const rootSpan = span && getRootSpan(span);

    if (rootSpan) {
      const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

      return {
        sentryTrace: spanToTraceHeader(span),
        sentryBaggage: dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext),
      };
    }
  }

  return {};
}

function makeWrappedRootLoader(remixVersion: number) {
  return function (origLoader: DataFunction): DataFunction {
    return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
      const res = await origLoader.call(this, args);
      const traceAndBaggage = getTraceAndBaggage();

      if (isDeferredData(res)) {
        res.data['sentryTrace'] = traceAndBaggage.sentryTrace;
        res.data['sentryBaggage'] = traceAndBaggage.sentryBaggage;
        res.data['remixVersion'] = remixVersion;

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
              { ...data, ...traceAndBaggage, remixVersion },
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

      return { ...res, ...traceAndBaggage, remixVersion };
    };
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
 * Starts a new active span for the given request to be used by different `RequestHandler` wrappers.
 */
export function startRequestHandlerSpan<T>(
  {
    name,
    source,
    sentryTrace,
    baggage,
    method,
  }: {
    name: string;
    source: TransactionSource;
    sentryTrace: string;
    baggage: string;
    method: string;
  },
  callback: (span: Span) => T,
): T {
  return continueTrace(
    {
      sentryTrace,
      baggage,
    },
    () => {
      return startSpan(
        {
          name,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.remix',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
            method,
          },
        },
        callback,
      );
    },
  );
}

/**
 * Get transaction name from routes and url
 */
export function getTransactionName(routes: ServerRoute[], url: URL): [string, TransactionSource] {
  const matches = matchServerRoutes(routes, url.pathname);
  const match = matches && getRequestMatch(url, matches);
  return match === null ? [url.pathname, 'url'] : [match.route.id || 'no-route-id', 'route'];
}

function wrapRequestHandler(origRequestHandler: RequestHandler, build: ServerBuild): RequestHandler {
  const routes = createRoutes(build.routes);

  return async function (this: unknown, request: RemixRequest, loadContext?: AppLoadContext): Promise<Response> {
    // This means that the request handler of the adapter (ex: express) is already wrapped.
    // So we don't want to double wrap it.
    if (loadContext?.__sentry_express_wrapped__) {
      return origRequestHandler.call(this, request, loadContext);
    }

    return withIsolationScope(async isolationScope => {
      const options = getClient()?.getOptions();

      let normalizedRequest: Record<string, unknown> = request;

      try {
        normalizedRequest = normalizeRemixRequest(request);
      } catch (e) {
        DEBUG_BUILD && logger.warn('Failed to normalize Remix request');
      }

      const url = new URL(request.url);
      const [name, source] = getTransactionName(routes, url);

      isolationScope.setSDKProcessingMetadata({
        request: {
          ...normalizedRequest,
          route: {
            path: name,
          },
        },
      });

      if (!options || !hasTracingEnabled(options)) {
        return origRequestHandler.call(this, request, loadContext);
      }

      return startRequestHandlerSpan(
        {
          name,
          source,
          sentryTrace: request.headers.get('sentry-trace') || '',
          baggage: request.headers.get('baggage') || '',
          method: request.method,
        },
        async span => {
          const res = (await origRequestHandler.call(this, request, loadContext)) as Response;

          if (isResponse(res)) {
            setHttpStatus(span, res.status);
          }

          return res;
        },
      );
    });
  };
}

/**
 * Instruments `remix` ServerBuild for performance tracing and error tracking.
 */
export function instrumentBuild(build: ServerBuild, manuallyInstrumented: boolean = false): ServerBuild {
  const routes: ServerRouteManifest = {};

  const remixVersion = getRemixVersionFromBuild(build);
  IS_REMIX_V2 = remixVersion === 2;

  const wrappedEntry = { ...build.entry, module: { ...build.entry.module } };

  // Not keeping boolean flags like it's done for `requestHandler` functions,
  // Because the build can change between build and runtime.
  // So if there is a new `loader` or`action` or `documentRequest` after build.
  // We should be able to wrap them, as they may not be wrapped before.
  const defaultExport = wrappedEntry.module.default as undefined | WrappedFunction;
  if (defaultExport && !defaultExport.__sentry_original__) {
    fill(wrappedEntry.module, 'default', makeWrappedDocumentRequestFunction(remixVersion));
  }

  for (const [id, route] of Object.entries(build.routes)) {
    const wrappedRoute = { ...route, module: { ...route.module } };

    const routeAction = wrappedRoute.module.action as undefined | WrappedFunction;
    if (routeAction && !routeAction.__sentry_original__) {
      fill(wrappedRoute.module, 'action', makeWrappedAction(id, remixVersion, manuallyInstrumented));
    }

    const routeLoader = wrappedRoute.module.loader as undefined | WrappedFunction;
    if (routeLoader && !routeLoader.__sentry_original__) {
      fill(wrappedRoute.module, 'loader', makeWrappedLoader(id, remixVersion, manuallyInstrumented));
    }

    // Entry module should have a loader function to provide `sentry-trace` and `baggage`
    // They will be available for the root `meta` function as `data.sentryTrace` and `data.sentryBaggage`
    if (!wrappedRoute.parentId) {
      if (!wrappedRoute.module.loader) {
        wrappedRoute.module.loader = () => ({});
      }

      // We want to wrap the root loader regardless of whether it's already wrapped before.
      fill(wrappedRoute.module, 'loader', makeWrappedRootLoader(remixVersion));
    }

    routes[id] = wrappedRoute;
  }

  return { ...build, routes, entry: wrappedEntry };
}

function makeWrappedCreateRequestHandler(
  origCreateRequestHandler: CreateRequestHandlerFunction,
): CreateRequestHandlerFunction {
  return function (this: unknown, build: ServerBuild, ...args: unknown[]): RequestHandler {
    FUTURE_FLAGS = getFutureFlagsServer(build);
    const newBuild = instrumentBuild(build, false);
    const requestHandler = origCreateRequestHandler.call(this, newBuild, ...args);

    return wrapRequestHandler(requestHandler, newBuild);
  };
}

/**
 * Monkey-patch Remix's `createRequestHandler` from `@remix-run/server-runtime`
 * which Remix Adapters (https://remix.run/docs/en/v1/api/remix) use underneath.
 */
export function instrumentServer(): void {
  const pkg = loadModule<{
    createRequestHandler: CreateRequestHandlerFunction;
  }>('@remix-run/server-runtime');

  if (!pkg) {
    DEBUG_BUILD && logger.warn('Remix SDK was unable to require `@remix-run/server-runtime` package.');

    return;
  }

  fill(pkg, 'createRequestHandler', makeWrappedCreateRequestHandler);
}
