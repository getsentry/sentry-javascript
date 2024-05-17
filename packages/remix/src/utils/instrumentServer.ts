/* eslint-disable max-lines */
import {
  captureException,
  getActiveSpan,
  getRootSpan,
  handleCallbackErrors,
  hasTracingEnabled,
  spanToJSON,
  spanToTraceHeader,
  withIsolationScope,
} from '@sentry/core';
import { continueTrace, getDynamicSamplingContextFromSpan } from '@sentry/opentelemetry';
import type { WrappedFunction } from '@sentry/types';
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
import { extractData, isDeferredData, isResponse, isRouteErrorResponse, json } from './vendor/response';
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
 * export const handleError = Sentry.sentryHandleError
 */
export function sentryHandleError(err: unknown, { request }: DataFunctionArgs): void {
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
 * @deprecated Use `sentryHandleError` instead.
 */
export const wrapRemixHandleError = sentryHandleError;

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

          throw err;
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
): DataFunction {
  return async function (this: unknown, args: DataFunctionArgs): Promise<Response | AppData> {
    return handleCallbackErrors(
      async () => {
        return origFn.call(this, args);
      },
      err => {
        const isRemixV2 = FUTURE_FLAGS?.v2_errorBoundary || remixVersion === 2;

        // On Remix v2, we capture all unexpected errors (except the `Route Error Response`s / Thrown Responses) in `handleError` function.
        // This is both for consistency and also avoid duplicates such as primitives like `string` or `number` being captured twice.
        // Remix v1 does not have a `handleError` function, so we capture all errors here.
        if (isRemixV2 ? isResponse(err) : true) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          captureRemixServerException(err, name, args.request);
        }

        throw err;
      },
    );
  };
}

const makeWrappedAction =
  (id: string, remixVersion: number) =>
  (origAction: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origAction, id, 'action', remixVersion);
  };

const makeWrappedLoader =
  (id: string, remixVersion: number) =>
  (origLoader: DataFunction): DataFunction => {
    return makeWrappedDataFunction(origLoader, id, 'loader', remixVersion);
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

function wrapRequestHandler(origRequestHandler: RequestHandler): RequestHandler {
  return async function (this: unknown, request: RemixRequest, loadContext?: AppLoadContext): Promise<Response> {
    const upperCaseMethod = request.method.toUpperCase();
    // We don't want to wrap OPTIONS and HEAD requests
    if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
      return origRequestHandler.call(this, request, loadContext);
    }

    return withIsolationScope(async isolationScope => {
      let normalizedRequest: Record<string, unknown> = request;

      try {
        normalizedRequest = normalizeRemixRequest(request);
      } catch (e) {
        DEBUG_BUILD && logger.warn('Failed to normalize Remix request');
      }
      isolationScope.setSDKProcessingMetadata({
        request: {
          ...normalizedRequest,
        },
      });
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
      fill(wrappedRoute.module, 'action', makeWrappedAction(id, remixVersion));
    }

    const routeLoader = wrappedRoute.module.loader as undefined | WrappedFunction;
    if (routeLoader && !routeLoader.__sentry_original__) {
      fill(wrappedRoute.module, 'loader', makeWrappedLoader(id, remixVersion));
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
          FUTURE_FLAGS = getFutureFlagsServer(build);

          return instrumentBuildCallback(build);
        });
      } else {
        FUTURE_FLAGS = getFutureFlagsServer(resolvedBuild);

        return instrumentBuildCallback(resolvedBuild);
      }
    };
  } else {
    FUTURE_FLAGS = getFutureFlagsServer(build);

    return instrumentBuildCallback(build);
  }
}

function makeWrappedCreateRequestHandler(
  origCreateRequestHandler: CreateRequestHandlerFunction,
): CreateRequestHandlerFunction {
  return function (
    this: unknown,
    build: ServerBuild | (() => Promise<ServerBuild>),
    ...args: unknown[]
  ): RequestHandler {
    const newBuild = instrumentBuild(build);
    const requestHandler = origCreateRequestHandler.call(this, newBuild, ...args);

    return wrapRequestHandler(requestHandler);
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
