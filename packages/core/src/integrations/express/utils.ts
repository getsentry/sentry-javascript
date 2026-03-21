import { getIsolationScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { getDefaultIsolationScope } from '../../defaultScopes';
import { debug } from '../../utils/debug-logger';
import type { SpanAttributes } from '../../types-hoist/span';
import { getStoredLayers } from './request-layer-store';
import type {
  ExpressExport,
  ExpressIntegrationOptions,
  ExpressLayer,
  ExpressLayerType,
  ExpressRequest,
  ExpressRequestInfo,
  IgnoreMatcher,
  LayerPathSegment,
  MiddlewareError,
  ExpressRouterv4,
  ExpressExportv5,
  ExpressExportv4,
} from './types';
import {
  ATTR_EXPRESS_NAME,
  ATTR_EXPRESS_TYPE,
  ExpressLayerType_MIDDLEWARE,
  ExpressLayerType_REQUEST_HANDLER,
  ExpressLayerType_ROUTER,
} from './types';

/**
 * Check whether the given obj match pattern
 * @param constant e.g URL of request
 * @param obj obj to inspect
 * @param pattern Match pattern
 */
export const satisfiesPattern = (constant: string, pattern: IgnoreMatcher): boolean => {
  if (typeof pattern === 'string') {
    return pattern === constant;
  } else if (pattern instanceof RegExp) {
    return pattern.test(constant);
  } else if (typeof pattern === 'function') {
    return pattern(constant);
  } else {
    throw new TypeError('Pattern is unsupported datatype');
  }
};

/**
 * Converts a user-provided error value into an error and error message pair
 *
 * @param error - User-provided error value
 * @returns Both an Error or string representation of the value and an error message
 */
export const asErrorAndMessage = (error: unknown): [string | Error, string] =>
  error instanceof Error ? [error, error.message] : [String(error), String(error)];

/**
 * Checks if a route contains parameter patterns (e.g., :id, :userId)
 * which are valid even if they don't exactly match the original URL
 */
export function isRoutePattern(route: string): boolean {
  return route.includes(':') || route.includes('*');
}

/**
 * Parse express layer context to retrieve a name and attributes.
 * @param route The route of the layer
 * @param layer Express layer
 * @param [layerPath] if present, the path on which the layer has been mounted
 */
export const getLayerMetadata = (
  route: string,
  layer: ExpressLayer,
  layerPath?: string,
): {
  attributes: SpanAttributes;
  name: string;
} => {
  if (layer.name === 'router') {
    const maybeRouterPath = getRouterPath('', layer);
    const extractedRouterPath = maybeRouterPath ? maybeRouterPath : layerPath || route || '/';

    return {
      attributes: {
        [ATTR_EXPRESS_NAME]: extractedRouterPath,
        [ATTR_EXPRESS_TYPE]: ExpressLayerType_ROUTER,
      },
      name: `router - ${extractedRouterPath}`,
    };
  } else if (layer.name === 'bound dispatch' || layer.name === 'handle') {
    return {
      attributes: {
        [ATTR_EXPRESS_NAME]: (route || layerPath) ?? 'request handler',
        [ATTR_EXPRESS_TYPE]: ExpressLayerType_REQUEST_HANDLER,
      },
      name: `request handler${layer.path ? ` - ${route || layerPath}` : ''}`,
    };
  } else {
    return {
      attributes: {
        [ATTR_EXPRESS_NAME]: layer.name,
        [ATTR_EXPRESS_TYPE]: ExpressLayerType_MIDDLEWARE,
      },
      name: `middleware - ${layer.name}`,
    };
  }
};

/**
 * Recursively search the router path from layer stack
 * @param path The path to reconstruct
 * @param layer The layer to reconstruct from
 * @returns The reconstructed path
 */
export const getRouterPath = (path: string, layer: ExpressLayer): string => {
  const stackLayer = Array.isArray(layer.handle?.stack) ? layer.handle?.stack?.[0] : undefined;

  if (stackLayer?.route?.path) {
    return `${path}${stackLayer.route.path}`;
  }

  if (stackLayer && Array.isArray(stackLayer?.handle?.stack)) {
    return getRouterPath(path, stackLayer);
  }

  return path;
};

/**
 * Check whether the given request is ignored by configuration
 * It will not re-throw exceptions from `list` provided by the client
 * @param constant e.g URL of request
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */
export type ExpressIsLayerIgnoredOptions = Pick<ExpressIntegrationOptions, 'ignoreLayersType' | 'ignoreLayers'>;
export const isLayerIgnored = (
  name: string,
  type: ExpressLayerType,
  config?: ExpressIsLayerIgnoredOptions,
): boolean => {
  if (Array.isArray(config?.ignoreLayersType) && config?.ignoreLayersType?.includes(type)) {
    return true;
  }
  if (!Array.isArray(config?.ignoreLayers)) return false;
  try {
    for (const pattern of config.ignoreLayers) {
      if (satisfiesPattern(name, pattern)) {
        return true;
      }
    }
  } catch {}

  return false;
};

/**
 * Extracts the actual matched route from Express request for OpenTelemetry instrumentation.
 * Returns the route that should be used as the http.route attribute.
 *
 * @param req - The Express request object with layers store
 * @param constructedRoute - The constructed route from `getConstructedRoute`
 * @returns The matched route string or undefined if no valid route is found
 */
export function getActualMatchedRoute(req: ExpressRequest, constructedRoute: string): string | undefined {
  const layersStore = getStoredLayers(req);

  // If no layers are stored, no route can be determined
  if (layersStore.length === 0) {
    return undefined;
  }

  // Handle root path case - if all paths are root, only return root if originalUrl is also root
  // The layer store also includes root paths in case a non-existing url was requested
  if (layersStore.every(path => path === '/')) {
    return req.originalUrl === '/' ? '/' : undefined;
  }

  if (constructedRoute === '*') {
    return constructedRoute;
  }

  // For RegExp routes or route arrays, return the constructed route
  // This handles the case where the route is defined using RegExp or an array
  if (
    constructedRoute.includes('/') &&
    (constructedRoute.includes(',') ||
      constructedRoute.includes('\\') ||
      constructedRoute.includes('*') ||
      constructedRoute.includes('['))
  ) {
    return constructedRoute;
  }

  // Ensure route starts with '/' if it doesn't already
  const normalizedRoute = constructedRoute.startsWith('/') ? constructedRoute : `/${constructedRoute}`;

  // Validate that this appears to be a matched route
  // A route is considered matched if:
  // 1. We have a constructed route
  // 2. The original URL matches or starts with our route pattern
  const isValidRoute =
    normalizedRoute.length > 0 &&
    (req.originalUrl === normalizedRoute ||
      req.originalUrl.startsWith(normalizedRoute) ||
      isRoutePattern(normalizedRoute));

  return isValidRoute ? normalizedRoute : undefined;
}

export function getConstructedRoute(req: ExpressRequest) {
  const layersStore: string[] = getStoredLayers(req);

  const meaningfulPaths = layersStore.filter(path => path !== '/' && path !== '/*');

  if (meaningfulPaths.length === 1 && meaningfulPaths[0] === '*') {
    return '*';
  }

  // Join parts and remove duplicate slashes
  return meaningfulPaths.join('').replace(/\/{2,}/g, '/');
}

export const getLayerPath = (args: unknown[]): string | undefined => {
  const firstArg = args[0];

  if (Array.isArray(firstArg)) {
    return firstArg.map(arg => extractLayerPathSegment(arg) || '').join(',');
  }

  return extractLayerPathSegment(firstArg as LayerPathSegment);
};

const extractLayerPathSegment = (arg: LayerPathSegment): string | undefined =>
  typeof arg === 'string' ? arg : arg instanceof RegExp || typeof arg === 'number' ? String(arg) : undefined;

// v5 we instrument Router.prototype
// v4 we instrument Router itself
export const isExpressWithRouterPrototype = (express: unknown): express is ExpressExportv5 =>
  isExpressRouterPrototype((express as ExpressExportv5)?.Router?.prototype);

// In Express v4, Router is a function (not a plain object), so we need to accept both
const isExpressRouterPrototype = (routerProto?: unknown): routerProto is ExpressRouterv4 =>
  (typeof routerProto === 'object' || typeof routerProto === 'function') &&
  !!routerProto &&
  'route' in routerProto &&
  typeof (routerProto as ExpressRouterv4).route === 'function';

export const isExpressWithoutRouterPrototype = (express: unknown): express is ExpressExportv4 =>
  isExpressRouterPrototype((express as ExpressExportv4).Router) && !isExpressWithRouterPrototype(express);

// dynamic puts the default on .default, require or normal import are fine
export const hasDefaultProp = (
  express: unknown,
): express is {
  [k: string]: unknown;
  default: ExpressExport;
} => !!express && typeof express === 'object' && 'default' in express && typeof express.default === 'function';

export function getSpanName(info: ExpressRequestInfo<unknown>, defaultName: string): string {
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

function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
export function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}
