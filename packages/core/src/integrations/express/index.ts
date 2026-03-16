/**
 * Platform-portable Express tracing integration, OTel-free, for use
 * on Cloudflare, Deno, Bun, etc.
 *
 * @module
 */

import type { SpanAttributes } from '../../types-hoist/span';
import { debug } from '../../utils/debug-logger';
import { captureException } from '../../exports';
import { getDefaultIsolationScope } from '../../defaultScopes';
import { getIsolationScope } from '../../currentScopes';
import { httpRequestToRequestData } from '../../utils/request';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { spanToJSON } from '../../utils/spanUtils';
import { SPAN_STATUS_ERROR, startSpan } from '../../tracing';
import { DEBUG_BUILD } from '../../debug-build';
import type {
  ExpressApplication,
  ExpressErrorMiddleware,
  ExpressExport,
  ExpressHandlerOptions,
  ExpressIntegrationOptions,
  ExpressLayer,
  ExpressLayerType,
  ExpressMiddleware,
  ExpressRequest,
  ExpressRequestInfo,
  ExpressResponse,
  ExpressRouter,
  MiddlewareError,
  Routerv4,
  Routerv5,
} from './types';
import {
  ATTR_EXPRESS_TYPE,
  ATTR_HTTP_ROUTE,
  ExpressLayerType_MIDDLEWARE,
  ExpressLayerType_ROUTER,
  kLayerPatched,
} from './types';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getStoredLayers, storeLayer } from './request-layer-store';
import {
  asErrorAndMessage,
  getActualMatchedRoute,
  getConstructedRoute,
  getLayerMetadata,
  getLayerPath,
  isLayerIgnored,
} from './utils';

// TODO: these two are passed to the ported out OTel inst
function getSpanName(info: ExpressRequestInfo<unknown>, defaultName: string): string {
  if (getIsolationScope() === getDefaultIsolationScope()) {
    DEBUG_BUILD && debug.warn('Isolation scope is still default isolation scope - skipping setting transactionName');
    return defaultName;
  }
  if (info.layerType === 'request_handler') {
    // type cast b/c Otel unfortunately types info.request as any :(
    const req = info.request as { method?: string };
    const method = req.method ? req.method.toUpperCase() : 'GET';
    getIsolationScope().setTransactionName(`${method} ${info.route}`);
  }
  return defaultName;
}

const isExpressWithRouterPrototype = (express: unknown): express is { Router: Routerv5 } =>
  isExpressRouterPrototype((express as ExpressExport & { Router: Routerv5 })?.Router?.prototype);
const isExpressRouterPrototype = (routerProto?: unknown) =>
  typeof routerProto === 'object' && !!routerProto && 'route' in routerProto && typeof routerProto.route === 'function';

const isExpressWithoutRouterPrototype = (express: unknown): express is ExpressExport & { Router: Routerv4 } =>
  !isExpressWithRouterPrototype(express);

// dynamic puts the default on .default, require or normal import are fine
const hasDefaultProp = (
  express: unknown,
): express is {
  [k: string]: unknown;
  default: ExpressExport;
} => !!express && typeof express === 'object' && 'default' in express && typeof express.default === 'function';

/**
 * This is a portable instrumentatiton function that works in any environment
 * where Express can be loaded, without depending on OpenTelemetry.
 *
 * @example
 * ```javascript
 * import express from 'express';
 * import * as Sentry from '@sentry/deno';
 *
 * instrumentExpress({ express })
 */
export const instrumentExpress = (options: ExpressIntegrationOptions) => {
  let { express } = options;
  // pass in the require() or import() result of express
  if (hasDefaultProp(express)) express = express.default;
  const routerProto: ExpressExport['Router'] | undefined = isExpressWithRouterPrototype(express)
    ? express.Router.prototype // Express v5
    : isExpressWithoutRouterPrototype(express)
      ? express.Router // Express v4
      : undefined;
  if (!routerProto) {
    throw new TypeError('no valid Express route function to instrument');
  }

  // oxlint-disable-next-line @typescript-eslint/unbound-method
  const originalRouteMethod = routerProto.route;
  Object.defineProperty(routerProto, 'route', {
    configurable: true,
    enumerable: true,
    value: function route_trace(this: ExpressRouter, ...args: Parameters<typeof originalRouteMethod>[]) {
      const route = originalRouteMethod.apply(this, args);
      const layer = this.stack[this.stack.length - 1] as ExpressLayer;
      patchLayer(options, layer, getLayerPath(args));
      return route;
    },
  });

  // oxlint-disable-next-line @typescript-eslint/unbound-method
  const originalRouterUse = routerProto.use;
  Object.defineProperty(routerProto, 'use', {
    configurable: true,
    enumerable: true,
    value: function use_trace(this: ExpressApplication, ...args: Parameters<typeof originalRouterUse>) {
      const route = originalRouterUse.apply(this, args);
      const layer = this.stack[this.stack.length - 1];
      if (!layer) return route;
      patchLayer(options, layer, getLayerPath(args));
      return route;
    },
  });

  const { application } = express;
  const originalApplicationUse = application.use;
  Object.defineProperty(application, 'use', {
    configurable: true,
    enumerable: true,
    value: function app_use_trace(
      this: { _router?: ExpressRouter; router?: ExpressRouter },
      ...args: Parameters<ExpressApplication['use']>
    ) {
      // If we access app.router in express 4.x we trigger an assertion error.
      // This property existed in v3, was removed in v4 and then re-added in v5.
      const router = isExpressWithRouterPrototype(express) ? this.router : this._router;
      const route = originalApplicationUse.apply(this, args);
      if (router) {
        const layer = router.stack[router.stack.length - 1];
        if (layer) {
          patchLayer(options, layer, getLayerPath(args));
        }
      }
      return route;
    },
  });

  return express;
};

/**
 * An Express-compatible error handler, used by setupExpressErrorHandler
 */
function expressErrorHandler(options?: ExpressHandlerOptions): ExpressErrorMiddleware {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    request: IncomingMessage,
    res: ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    const normalizedRequest = httpRequestToRequestData(request);
    // Ensure we use the express-enhanced request here, instead of the plain HTTP one
    // When an error happens, the `expressRequestHandler` middleware does not run, so we set it here too
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });

    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      const eventId = captureException(error, { mechanism: { type: 'auto.middleware.express', handled: false } });
      (res as { sentry?: string }).sentry = eventId;
    }

    next(error);
  };
}

function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}

/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instances
 * @param options {ExpressHandlerOptions} Configuration options for the handler
 *
 * @example
 * ```javascript
 * import * as Sentry from 'sentry/deno'; // or any other @sentry/<platform>
 * import * as express from 'express';
 *
 * Sentry.instrumentExpress(express);
 *
 * const app = express();
 *
 * // Add your routes, etc.
 *
 * // Add this after all routes,
 * // but before any and other error-handling middlewares are defined
 * Sentry.setupExpressErrorHandler(app);
 *
 * app.listen(3000);
 * ```
 */
export function setupExpressErrorHandler(
  app: { use: (middleware: ExpressMiddleware | ExpressErrorMiddleware) => unknown },
  options?: ExpressHandlerOptions,
): void {
  app.use(expressRequestHandler());
  app.use(expressErrorHandler(options));
}

function expressRequestHandler(): ExpressMiddleware {
  return function sentryRequestMiddleware(request: IncomingMessage, _res: ServerResponse, next: () => void): void {
    const normalizedRequest = httpRequestToRequestData(request);
    // Ensure we use the express-enhanced request here, instead of the plain HTTP one
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });

    next();
  };
}

function patchLayer(options: ExpressIntegrationOptions, layer: ExpressLayer, layerPath?: string) {
  // avoid patching multiple times the same layer
  if (layer[kLayerPatched] === true) return;
  layer[kLayerPatched] = true;

  const originalHandle = layer.handle;
  if (originalHandle.length === 4) {
    // todo: instrument error handlers
  } else {
    Object.defineProperty(layer, 'handle', {
      enumerable: true,
      configurable: true,
      value: function layer_handle_patched(this: ExpressLayer, req: ExpressRequest, res: ExpressResponse) {
        if (layerPath) storeLayer(req, layerPath);
        const storedLayers = getStoredLayers(req);
        const isLayerPathStored = !!layerPath;

        const constructedRoute = getConstructedRoute(req);
        const actualMatchedRoute = getActualMatchedRoute(req);

        const attributes: SpanAttributes = actualMatchedRoute
          ? {
              [ATTR_HTTP_ROUTE]: actualMatchedRoute,
            }
          : {};
        const metadata = getLayerMetadata(constructedRoute, layer, layerPath);
        const type = metadata.attributes[ATTR_EXPRESS_TYPE] as ExpressLayerType;

        // verify against the config if the layer should be ignored
        if (isLayerIgnored(metadata.name, type, options)) {
          if (type === ExpressLayerType_MIDDLEWARE) {
            storedLayers.pop();
          }
          return originalHandle.apply(this, arguments);
        }

        const spanName = getSpanName(
          {
            request: req,
            layerType: type,
            route: constructedRoute,
          },
          metadata.name,
        );
        startSpan(
          {
            name: spanName,
            attributes: Object.assign(attributes, metadata.attributes),
          },
          span => {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.http.express');

            const attributes = spanToJSON(span).data;
            // this is one of: middleware, request_handler, router
            const type = attributes['express.type'];

            if (type) {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, `${type}.express`);
            }

            // Also update the name, we don't need to "middleware - " prefix
            const name = attributes['express.name'];
            if (typeof name === 'string') {
              span.updateName(name);
            }

            let spanHasEnded = false;
            // TODO: Fix router spans (getRouterPath does not work properly) to
            // have useful names before removing this branch
            if (metadata.attributes[ATTR_EXPRESS_TYPE] === ExpressLayerType_ROUTER) {
              span.end();
              spanHasEnded = true;
            }
            // listener for response.on('finish')
            const onResponseFinish = () => {
              if (spanHasEnded === false) {
                spanHasEnded = true;
                span.end();
              }
            };

            // verify we have a callback
            const args = Array.from(arguments);
            const callbackIdx = args.findIndex(arg => typeof arg === 'function');
            if (callbackIdx >= 0) {
              arguments[callbackIdx] = function () {
                // express considers anything but an empty value, "route" or "router"
                // passed to its callback to be an error
                const maybeError = arguments[0];
                const isError = ![undefined, null, 'route', 'router'].includes(maybeError);
                if (!spanHasEnded && isError) {
                  const [error, message] = asErrorAndMessage(maybeError);
                  span.recordException(error);
                  span.setStatus({
                    code: SPAN_STATUS_ERROR,
                    message,
                  });
                }

                if (spanHasEnded === false) {
                  spanHasEnded = true;
                  req.res?.removeListener('finish', onResponseFinish);
                  span.end();
                }
                if (!(req.route && isError) && isLayerPathStored) {
                  storedLayers.pop();
                }
                const callback = args[callbackIdx] as Function;
                return callback.apply(this, arguments);
              };
            }

            try {
              return originalHandle.apply(this, arguments);
            } catch (anyError) {
              const [error, message] = asErrorAndMessage(anyError);
              span.recordException(error);
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message,
              });
              throw anyError;
            } finally {
              /**
               * At this point if the callback wasn't called, that means either the
               * layer is asynchronous (so it will call the callback later on) or that
               * the layer directly ends the http response, so we'll hook into the "finish"
               * event to handle the later case.
               */
              if (!spanHasEnded) {
                res.once('finish', onResponseFinish);
              }
            }
          },
        );
      },
    });
  }
}
