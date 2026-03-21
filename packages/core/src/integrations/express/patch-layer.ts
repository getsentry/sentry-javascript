import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR, startSpanManual, withActiveSpan } from '../../tracing';
import type { SpanAttributes } from '../../types-hoist/span';
import { getActiveSpan } from '../../utils/spanUtils';
import { getStoredLayers, storeLayer } from './request-layer-store';
import {
  type ExpressRequest,
  type ExpressResponse,
  kLayerPatched,
  type ExpressIntegrationOptions,
  type ExpressLayer,
  ATTR_HTTP_ROUTE,
  ATTR_EXPRESS_TYPE,
  ATTR_EXPRESS_NAME,
  type ExpressLayerType,
  ExpressLayerType_MIDDLEWARE,
  ExpressLayerType_ROUTER,
} from './types';
import {
  asErrorAndMessage,
  getActualMatchedRoute,
  getConstructedRoute,
  getLayerMetadata,
  getSpanName,
  isLayerIgnored,
} from './utils';

export type ExpressPatchLayerOptions = Pick<
  ExpressIntegrationOptions,
  'onRouteResolved' | 'ignoreLayers' | 'ignoreLayersType'
>;

export function patchLayer(options: ExpressPatchLayerOptions, layer?: ExpressLayer, layerPath?: string): void {
  if (!layer) return;

  // avoid patching multiple times the same layer
  if (layer[kLayerPatched] === true) return;
  layer[kLayerPatched] = true;

  const originalHandle = layer.handle;
  if (originalHandle.length === 4) {
    // todo: instrument error handlers
    return;
  }

  Object.defineProperty(layer, 'handle', {
    enumerable: true,
    configurable: true,
    value: function layerHandlePatched(
      this: ExpressLayer,
      req: ExpressRequest,
      res: ExpressResponse,
      //oxlint-disable-next-line no-explicit-any
      ...otherArgs: any[]
    ) {
      // Only create spans when there's an active parent span
      // Without a parent span, this request is being ignored, so skip it
      const parentSpan = getActiveSpan();
      if (!parentSpan) {
        return originalHandle.apply(this, [req, res, ...otherArgs]);
      }

      if (layerPath) storeLayer(req, layerPath);
      const storedLayers = getStoredLayers(req);
      const isLayerPathStored = !!layerPath;

      const constructedRoute = getConstructedRoute(req);
      const actualMatchedRoute = getActualMatchedRoute(req, constructedRoute);

      options.onRouteResolved?.(actualMatchedRoute);

      const metadata = getLayerMetadata(constructedRoute, layer, layerPath);
      const type = metadata.attributes[ATTR_EXPRESS_TYPE] as ExpressLayerType;
      const attributes: SpanAttributes = Object.assign(metadata.attributes, {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.express',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.express`,
      });
      if (actualMatchedRoute) {
        attributes[ATTR_HTTP_ROUTE] = actualMatchedRoute;
      }

      // verify against the config if the layer should be ignored
      if (isLayerIgnored(metadata.name, type, options)) {
        // XXX: the isLayerPathStored guard here is *not* present in the
        // original @opentelemetry/instrumentation-express impl, but was
        // suggested by the Sentry code review bot. It appears to correctly
        // prevent improper layer calculation in the case where there's a
        // middleware without a layerPath argument. It's unclear whether
        // that's possible, or if any existing code depends on that "bug".
        if (isLayerPathStored && type === ExpressLayerType_MIDDLEWARE) {
          storedLayers.pop();
        }
        return originalHandle.apply(this, [req, res, ...otherArgs]);
      }

      const spanName = getSpanName(
        {
          request: req,
          layerType: type,
          route: constructedRoute,
        },
        metadata.name,
      );
      return startSpanManual({ name: spanName, attributes }, span => {
        // Also update the name, we don't need to "middleware - " prefix
        const name = attributes[ATTR_EXPRESS_NAME];
        if (typeof name === 'string') {
          // should this be updateSpanName?
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
        for (let i = 0; i < otherArgs.length; i++) {
          const callback = otherArgs[i] as Function;
          if (typeof callback !== 'function') continue;

          //oxlint-disable-next-line no-explicit-any
          otherArgs[i] = function (...args: any[]) {
            // express considers anything but an empty value, "route" or "router"
            // passed to its callback to be an error
            const maybeError = args[0];
            const isError = ![undefined, null, 'route', 'router'].includes(maybeError);
            if (!spanHasEnded && isError) {
              const [_, message] = asErrorAndMessage(maybeError);
              // intentionally do not record the exception here, because
              // the error handler we assign does that
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message,
              });
            }

            if (spanHasEnded === false) {
              spanHasEnded = true;
              res.removeListener('finish', onResponseFinish);
              span.end();
            }
            if (!(req.route && isError) && isLayerPathStored) {
              storedLayers.pop();
            }
            // execute the callback back in the parent's scope, so that
            // we bubble up each level as next() is called.
            return withActiveSpan(parentSpan, () => callback.apply(this, args));
          };
          break;
        }

        try {
          return originalHandle.apply(this, [req, res, ...otherArgs]);
        } catch (anyError) {
          const [_, message] = asErrorAndMessage(anyError);
          // intentionally do not record the exception here, because
          // the error handler we assign does that
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message,
          });
          throw anyError;
          /* v8 ignore next - it sees the block end at the throw */
        } finally {
          // At this point if the callback wasn't called, that means
          // either the layer is asynchronous (so it will call the
          // callback later on) or that the layer directly ends the
          // http response, so we'll hook into the "finish" event to
          // handle the later case.
          if (!spanHasEnded) {
            res.once('finish', onResponseFinish);
          }
        }
      });
    },
  });
}
