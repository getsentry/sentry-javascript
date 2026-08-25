import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import {
  debug,
  defineIntegration,
  getActiveSpan,
  getDefaultIsolationScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/core';
// oxlint-disable-next-line typescript/no-deprecated
import { CODE_FUNCTION_NAME, HTTP_ROUTE, KOA_NAME, KOA_TYPE, SENTRY_OP } from '@sentry/conventions/attributes';
import { MIDDLEWARE } from '@sentry/conventions/op';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { koaModuleNames } from '../orchestrion/config/koa';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { setHttpServerSpanRouteAttribute } from '../utils/setHttpServerSpanRouteAttribute';

// Same name as the OTel integration. When enabled, the OTel 'Koa' integration is omitted from the default set.
const INTEGRATION_NAME = 'Koa' as const;

const ORIGIN = 'auto.http.koa';

const LAYER_TYPE = {
  ROUTER: 'router',
  MIDDLEWARE: 'middleware',
} as const;
type KoaLayerType = (typeof LAYER_TYPE)[keyof typeof LAYER_TYPE];

// Keeps wrapping idempotent — the same middleware instance can be registered on
// multiple routes (mirrors the vendored OTel instrumentation's symbol).
const kLayerPatched: unique symbol = Symbol('sentry.koa.layer-patched');

type Next = () => Promise<unknown>;

interface KoaContext {
  [key: string]: unknown;
  _matchedRoute?: string | RegExp;
  _matchedRouteName?: string;
  request?: { method?: string };
}

interface Layer {
  path: string | RegExp;
  stack: KoaMiddleware[];
}

interface Router {
  stack: Layer[];
}

type KoaMiddleware = ((context: KoaContext, next: Next) => unknown) & {
  router?: Router;
  [kLayerPatched]?: boolean;
};

type KoaSpanAttributes = Record<string, string | undefined>;

interface KoaMiddlewareMetadata {
  attributes: KoaSpanAttributes;
  name: string;
}

interface KoaUseContext {
  arguments: unknown[];
}

export interface KoaIntegrationOptions {
  /** Ignore layers of the specified types (`'middleware'` and/or `'router'`). */
  ignoreLayersType?: Array<'middleware' | 'router'>;
}

const _koaIntegration = ((options: KoaIntegrationOptions = {}) => {
  const ignoreLayersType = options.ignoreLayersType ?? [];

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, koaModuleNames, instrumentKoa, [ignoreLayersType], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentKoa(ignoreLayersType: KoaLayerType[]): void {
  diagnosticsChannel.tracingChannel(CHANNELS.KOA_USE).subscribe({
    start(rawCtx) {
      handleUse(rawCtx as KoaUseContext, ignoreLayersType);
    },
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error() {},
  });
}

function handleUse(ctx: KoaUseContext, ignoreLayersType: KoaLayerType[]): void {
  const middleware = ctx.arguments[0];
  if (typeof middleware === 'function') {
    ctx.arguments[0] = patchUse(middleware as KoaMiddleware, ignoreLayersType);
  }
}

/**
 * Wrap a registered koa middleware. A `@koa/router` dispatch layer
 * (`router.routes()`) exposes a `.router`, in which case we patch each routed
 * middleware in its stack (in place) and leave the dispatch itself unwrapped;
 * everything else is a plain middleware.
 */
function patchUse(middleware: KoaMiddleware, ignoreLayersType: KoaLayerType[]): KoaMiddleware {
  return middleware.router
    ? patchRouterDispatch(middleware, ignoreLayersType)
    : patchLayer(middleware, false, ignoreLayersType);
}

/**
 * Patches the dispatch function used by `@koa/router`, wrapping each routed
 * middleware in the router's stack so routed spans carry their matched path.
 */
function patchRouterDispatch(dispatchLayer: KoaMiddleware, ignoreLayersType: KoaLayerType[]): KoaMiddleware {
  const router = dispatchLayer.router;
  const routesStack = router?.stack ?? [];
  for (const pathLayer of routesStack) {
    const path = pathLayer.path;
    const pathStack = pathLayer.stack;
    pathStack.forEach((routedMiddleware, j) => {
      pathStack[j] = patchLayer(routedMiddleware, true, ignoreLayersType, path);
    });
  }
  return dispatchLayer;
}

/**
 * Wraps an individual middleware layer so it opens a span when invoked. No span
 * is created when there is no active (parent) span, matching the vendored OTel
 * instrumentation's `api.trace.getSpan(api.context.active())` guard.
 */
function patchLayer(
  middlewareLayer: KoaMiddleware,
  isRouter: boolean,
  ignoreLayersType: KoaLayerType[],
  layerPath?: string | RegExp,
): KoaMiddleware {
  const layerType = isRouter ? LAYER_TYPE.ROUTER : LAYER_TYPE.MIDDLEWARE;
  // Skip patching the layer if it's ignored by config or already wrapped.
  if (middlewareLayer[kLayerPatched] === true || ignoreLayersType.includes(layerType)) {
    return middlewareLayer;
  }

  if (
    middlewareLayer.constructor.name === 'GeneratorFunction' ||
    middlewareLayer.constructor.name === 'AsyncGeneratorFunction'
  ) {
    return middlewareLayer;
  }

  middlewareLayer[kLayerPatched] = true;

  return (context: KoaContext, next: Next) => {
    if (!getActiveSpan()) {
      return middlewareLayer(context, next);
    }
    const metadata = getMiddlewareMetadata(context, middlewareLayer, isRouter, layerPath);

    if (context._matchedRoute) {
      setHttpServerSpanRouteAttribute(context._matchedRoute.toString());
    }

    // oxlint-disable-next-line typescript/no-deprecated
    const koaName = metadata.attributes[KOA_NAME];
    // Somehow, name is sometimes `''` for middleware spans.
    // See: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2220
    const name = typeof koaName === 'string' ? koaName || '< unknown >' : metadata.name;

    return startSpan(
      {
        name,
        attributes: {
          ...metadata.attributes,
          // TODO(conventions): Replace `'router'` with the `router` span op constant once it is released in `@sentry/conventions`.
          [SENTRY_OP]: layerType === LAYER_TYPE.MIDDLEWARE ? MIDDLEWARE : 'router',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        },
      },
      () => {
        const route = metadata.attributes[HTTP_ROUTE];
        if (getIsolationScope() === getDefaultIsolationScope()) {
          DEBUG_BUILD && debug.warn('Isolation scope is default isolation scope - skipping setting transactionName');
        } else if (route) {
          const method = context.request?.method?.toUpperCase() || 'GET';
          getIsolationScope().setTransactionName(`${method} ${route}`);
        }
        return middlewareLayer(context, next);
      },
    );
  };
}

function getMiddlewareMetadata(
  context: KoaContext,
  layer: KoaMiddleware,
  isRouter: boolean,
  layerPath?: string | RegExp,
): KoaMiddlewareMetadata {
  if (isRouter) {
    return {
      attributes: {
        // oxlint-disable-next-line typescript/no-deprecated
        [KOA_NAME]: layerPath?.toString(), // TODO(v11): remove, replaced by http.route
        [KOA_TYPE]: LAYER_TYPE.ROUTER,
        [HTTP_ROUTE]: layerPath?.toString(),
      },
      name: context._matchedRouteName || `router - ${layerPath}`,
    };
  }
  return {
    attributes: {
      // oxlint-disable-next-line typescript/no-deprecated
      [KOA_NAME]: layer.name || 'middleware', // TODO(v11): remove, replaced by code.function.name
      [KOA_TYPE]: LAYER_TYPE.MIDDLEWARE,
      [CODE_FUNCTION_NAME]: layer.name || 'middleware',
    },
    name: `middleware - ${layer.name}`,
  };
}

/**
 * Orchestrion-driven koa integration. Subscribes to the
 * `orchestrion:koa:use` channel injected into `Application.prototype.use` and
 * wraps each registered middleware/router layer in a span-creating proxy.
 * Requires the orchestrion runtime hook or bundler plugin.
 */
export const koaIntegration = defineIntegration(_koaIntegration);
