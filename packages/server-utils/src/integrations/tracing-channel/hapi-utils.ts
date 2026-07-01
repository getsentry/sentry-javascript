/*
 * OTel-free, `@hapi/*`-free port of the span-building helpers and handler/ext
 * wrap logic from the vendored `@opentelemetry/instrumentation-hapi`
 * (upstream @opentelemetry/instrumentation-hapi@0.64.0). Span output (names,
 * ops, origins, attributes) is kept byte-identical to that instrumentation;
 * span creation goes through the `@sentry/core` API and the OTel active-span
 * guard is replaced with `getActiveSpan()`.
 */

import {
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import type {
  LifecycleMethod,
  PatchableExtMethod,
  PatchableServerRoute,
  ServerExtDirectInput,
  ServerExtEventsObject,
  ServerExtEventsRequestObject,
  ServerRequestExtType,
  ServerRoute,
  ServerRouteOptions,
} from './hapi-types';
// eslint-disable-next-line typescript/no-deprecated -- TODO(v11): Replace deprecated attributes
import { HTTP_METHOD, HTTP_ROUTE } from '@sentry/conventions/attributes';
import { AttributeNames, handlerPatched, HapiLayerType, HapiLifecycleMethodNames } from './hapi-types';

type SpanAttributes = Record<string, string | undefined>;

interface SpanMetadata {
  attributes: SpanAttributes;
  name: string;
}

/**
 * Set the `http.route` attribute on the root HTTP server span for the current trace.
 *
 * No-op when there is no active span, no root span, or the root span is not an
 * `http.server` span — so framework instrumentations can call this unconditionally
 * without risking attribute pollution on non-HTTP root spans.
 */
function setHttpServerSpanRouteAttribute(route: string): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }
  const rootSpan = getRootSpan(activeSpan);
  if (!rootSpan) {
    return;
  }
  if (spanToJSON(rootSpan).data[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'http.server') {
    return;
  }
  rootSpan.setAttribute(HTTP_ROUTE, route);
}

const isLifecycleExtType = (variableToCheck: unknown): variableToCheck is ServerRequestExtType => {
  return typeof variableToCheck === 'string' && HapiLifecycleMethodNames.has(variableToCheck);
};

const isLifecycleExtEventObj = (variableToCheck: unknown): variableToCheck is ServerExtEventsRequestObject => {
  const event = (variableToCheck as ServerExtEventsRequestObject)?.type;
  return event !== undefined && isLifecycleExtType(event);
};

const isDirectExtInput = (variableToCheck: unknown): variableToCheck is ServerExtDirectInput => {
  return (
    Array.isArray(variableToCheck) &&
    variableToCheck.length <= 3 &&
    isLifecycleExtType(variableToCheck[0]) &&
    typeof variableToCheck[1] === 'function'
  );
};

const isPatchableExtMethod = (
  variableToCheck: PatchableExtMethod | PatchableExtMethod[],
): variableToCheck is PatchableExtMethod => {
  return !Array.isArray(variableToCheck);
};

/** Build the span name and attributes for a Hapi route. */
export const getRouteMetadata = (route: ServerRoute, pluginName?: string): SpanMetadata => {
  const attributes: SpanAttributes = {
    [HTTP_ROUTE]: route.path,
    // eslint-disable-next-line typescript/no-deprecated -- TODO(v11): Replace deprecated attributes
    [HTTP_METHOD]: route.method,
  };

  let name;
  if (pluginName) {
    attributes[AttributeNames.HAPI_TYPE] = HapiLayerType.PLUGIN;
    attributes[AttributeNames.PLUGIN_NAME] = pluginName;
    name = `${pluginName}: route - ${route.path}`;
  } else {
    attributes[AttributeNames.HAPI_TYPE] = HapiLayerType.ROUTER;
    name = `route - ${route.path}`;
  }

  return { attributes, name };
};

/** Build the span name and attributes for a Hapi server extension. */
export const getExtMetadata = (
  extPoint: ServerRequestExtType,
  pluginName?: string,
  methodName?: string,
): SpanMetadata => {
  let baseName = `ext - ${extPoint}`;
  if (methodName && methodName !== 'method') {
    // `method` is the default name for the extension in the ServerExtEventsObject format.
    baseName = `ext - ${extPoint} - ${methodName}`;
  }
  if (pluginName) {
    return {
      attributes: {
        [AttributeNames.EXT_TYPE]: extPoint,
        [AttributeNames.HAPI_TYPE]: HapiLayerType.EXT,
        [AttributeNames.PLUGIN_NAME]: pluginName,
      },
      name: `${pluginName}: ${baseName}`,
    };
  }
  return {
    attributes: {
      [AttributeNames.EXT_TYPE]: extPoint,
      [AttributeNames.HAPI_TYPE]: HapiLayerType.EXT,
    },
    name: baseName,
  };
};

function startMetadataSpan(metadata: SpanMetadata, original: () => unknown): unknown {
  return startSpan(
    {
      name: metadata.name,
      op: `${metadata.attributes[AttributeNames.HAPI_TYPE]}.hapi`,
      attributes: {
        ...metadata.attributes,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.orchestrion.hapi',
      },
    },
    original,
  );
}

/**
 * Patches each individual route handler method in order to create the span. It
 * does not create spans when there is no parent span.
 */
function wrapRouteHandler(route: PatchableServerRoute, pluginName?: string): PatchableServerRoute {
  if (route[handlerPatched] === true) return route;
  route[handlerPatched] = true;

  const wrapHandler: (oldHandler: LifecycleMethod) => LifecycleMethod = oldHandler => {
    return function (this: unknown, ...params: Parameters<LifecycleMethod>) {
      if (!getActiveSpan()) {
        return oldHandler.call(this, ...params);
      }
      setHttpServerSpanRouteAttribute(route.path);
      const metadata = getRouteMetadata(route, pluginName);
      return startMetadataSpan(metadata, () => oldHandler.call(this, ...params));
    };
  };

  if (typeof route.handler === 'function') {
    route.handler = wrapHandler(route.handler as LifecycleMethod);
  } else if (typeof route.options === 'function') {
    const oldOptions = route.options;
    route.options = function (server: unknown): ServerRouteOptions {
      const options = oldOptions(server);
      if (typeof options.handler === 'function') {
        options.handler = wrapHandler(options.handler as LifecycleMethod);
      }
      return options;
    };
  } else if (typeof route.options?.handler === 'function') {
    route.options.handler = wrapHandler(route.options.handler as LifecycleMethod);
  }
  return route;
}

/**
 * Wraps request extension methods to add instrumentation to each new extension
 * handler. It does not create spans when there is no parent span.
 */
function wrapExtMethods<T extends PatchableExtMethod | PatchableExtMethod[]>(
  method: T,
  extPoint: ServerRequestExtType,
  pluginName?: string,
): T {
  if (Array.isArray(method)) {
    for (let i = 0; i < method.length; i++) {
      method[i] = wrapExtMethods(method[i]!, extPoint);
    }
    return method;
  } else if (isPatchableExtMethod(method)) {
    if (method[handlerPatched] === true) return method;
    method[handlerPatched] = true;

    const newHandler: PatchableExtMethod = function (this: unknown, ...params: Parameters<LifecycleMethod>) {
      if (!getActiveSpan()) {
        return method.apply(this, params);
      }
      const metadata = getExtMetadata(extPoint, pluginName, method.name);
      return startMetadataSpan(metadata, () => method.apply(undefined, params));
    };
    // Mark the wrapper too (not just the original)
    newHandler[handlerPatched] = true;
    return newHandler as T;
  }
  return method;
}

/**
 * Wrap the route handler(s) in the live `server.route` arguments array, mutating
 * `args[0]` in place. `args[0]` is either a single route options object or an
 * array of them. Idempotent via the `handlerPatched` marker.
 */
export function wrapRouteArguments(args: unknown[], pluginName?: string): void {
  const route = args[0] as PatchableServerRoute | PatchableServerRoute[];
  if (Array.isArray(route)) {
    for (let i = 0; i < route.length; i++) {
      route[i] = wrapRouteHandler(route[i]!, pluginName);
    }
  } else {
    args[0] = wrapRouteHandler(route, pluginName);
  }
}

/**
 * Wrap the extension method(s) in the live `server.ext` arguments array,
 * mutating `args` in place. Handles the three accepted input shapes:
 * `(eventsArray)`, `(lifecycleEventObject)`, and `(extTypeString, method, options)`.
 * Idempotent via the `handlerPatched` marker.
 */
export function wrapExtArguments(args: unknown[], pluginName?: string): void {
  if (Array.isArray(args[0])) {
    const eventsList = args[0] as ServerExtEventsObject[] | ServerExtEventsRequestObject[];
    for (let i = 0; i < eventsList.length; i++) {
      const eventObj = eventsList[i]!;
      if (isLifecycleExtType(eventObj.type)) {
        const lifecycleEventObj = eventObj as ServerExtEventsRequestObject;
        const handler = wrapExtMethods(lifecycleEventObj.method, eventObj.type, pluginName);
        lifecycleEventObj.method = handler;
        eventsList[i] = lifecycleEventObj;
      }
    }
    return;
  } else if (isDirectExtInput(args)) {
    const extInput: ServerExtDirectInput = args;
    const method: PatchableExtMethod = extInput[1];
    const handler = wrapExtMethods(method, extInput[0], pluginName);
    args[1] = handler;
    return;
  } else if (isLifecycleExtEventObj(args[0])) {
    const lifecycleEventObj = args[0];
    const handler = wrapExtMethods(lifecycleEventObj.method, lifecycleEventObj.type, pluginName);
    lifecycleEventObj.method = handler;
  }
}
