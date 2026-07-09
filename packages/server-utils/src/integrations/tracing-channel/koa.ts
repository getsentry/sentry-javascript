import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import {
  debug,
  defineIntegration,
  getActiveSpan,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { CODE_FUNCTION_NAME, HTTP_ROUTE } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

// Same name as the OTel integration. When enabled, the OTel 'Koa' integration is omitted from the default set.
const INTEGRATION_NAME = 'Koa' as const;

const ORIGIN = 'auto.http.orchestrion.koa';

// `koa.type` (a layer's role) has no `@sentry/conventions` equivalent, so it stays
// the canonical attribute — kept in sync with the OTel koa integration so spans are
// identical across both code paths.
const ATTR_KOA_TYPE = 'koa.type';
// TODO(v11): remove this attribute.
const ATTR_KOA_NAME = 'koa.name';

const LAYER_TYPE = {
  ROUTER: 'router',
  MIDDLEWARE: 'middleware',
} as const;
type KoaLayerType = (typeof LAYER_TYPE)[keyof typeof LAYER_TYPE];

// Keeps wrapping idempotent — the same middleware instance can be registered on
// multiple routes (mirrors the vendored OTel instrumentation's symbol).
const kLayerPatched: unique symbol = Symbol('sentry.koa.layer-patched');

// Core dedupes `setupOnce` by integration name, but the Deno SDK also runs this
// under the name `DenoKoa` (via `extendIntegration`), so guard against a second
// subscription here.
let subscribed = false;

let ignoreLayersType: KoaLayerType[] = [];

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

// `arguments[0]` is the live middleware array passed to `compose(middleware)`;
// we mutate its entries in place to swap each layer for a span-creating proxy.
interface KoaComposeContext {
  arguments: unknown[];
}

export interface KoaChannelIntegrationOptions {
  /** Ignore layers of the specified types (`'middleware'` and/or `'router'`). */
  ignoreLayersType?: Array<'middleware' | 'router'>;
}

const _koaChannelIntegration = ((options: KoaChannelIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;
      ignoreLayersType = (options.ignoreLayersType ?? []) as KoaLayerType[];

      DEBUG_BUILD && debug.log(`[orchestrion:koa] subscribing to channel "${CHANNELS.KOA_COMPOSE}"`);

      // `subscribe` requires all five lifecycle hooks. We only act on `start`,
      // which orchestrion fires synchronously with the live middleware array.
      diagnosticsChannel.tracingChannel(CHANNELS.KOA_COMPOSE).subscribe({
        start(rawCtx) {
          handleCompose(rawCtx as KoaComposeContext);
        },
        end() {},
        asyncStart() {},
        asyncEnd() {},
        error() {},
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * koa calls `compose(app.middleware)` once at startup (no active span); `@koa/router`
 * calls it per request while the `http.server` span is active. We only wrap at startup
 * — the route handlers are wrapped in place via the router-stack descent, so skipping
 * the per-request call just avoids spanning the router's internal param-setters.
 */
function handleCompose(ctx: KoaComposeContext): void {
  if (getActiveSpan()) {
    return;
  }
  const middleware = ctx.arguments[0];
  if (!Array.isArray(middleware)) {
    return;
  }
  middleware.forEach((layer, i) => {
    if (typeof layer === 'function') {
      middleware[i] = patchUse(layer as KoaMiddleware);
    }
  });
}

/**
 * Wrap a registered koa middleware. A `@koa/router` dispatch layer
 * (`router.routes()`) exposes a `.router`, in which case we patch each routed
 * middleware in its stack (in place) and leave the dispatch itself unwrapped;
 * everything else is a plain middleware.
 */
function patchUse(middleware: KoaMiddleware): KoaMiddleware {
  return middleware.router ? patchRouterDispatch(middleware) : patchLayer(middleware, false);
}

/**
 * Patches the dispatch function used by `@koa/router`, wrapping each routed
 * middleware in the router's stack so routed spans carry their matched path.
 */
function patchRouterDispatch(dispatchLayer: KoaMiddleware): KoaMiddleware {
  const router = dispatchLayer.router;
  const routesStack = router?.stack ?? [];
  for (const pathLayer of routesStack) {
    const path = pathLayer.path;
    const pathStack = pathLayer.stack;
    pathStack.forEach((routedMiddleware, j) => {
      pathStack[j] = patchLayer(routedMiddleware, true, path);
    });
  }
  return dispatchLayer;
}

/**
 * Wraps an individual middleware layer so it opens a span when invoked. No span
 * is created when there is no active (parent) span, matching the vendored OTel
 * instrumentation's `api.trace.getSpan(api.context.active())` guard.
 */
function patchLayer(middlewareLayer: KoaMiddleware, isRouter: boolean, layerPath?: string | RegExp): KoaMiddleware {
  const layerType = isRouter ? LAYER_TYPE.ROUTER : LAYER_TYPE.MIDDLEWARE;
  // Skip patching the layer if it's ignored by config or already wrapped.
  if (middlewareLayer[kLayerPatched] === true || isLayerIgnored(layerType)) {
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

    const koaName = metadata.attributes[ATTR_KOA_NAME];
    // Somehow, name is sometimes `''` for middleware spans.
    // See: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2220
    const name = typeof koaName === 'string' ? koaName || '< unknown >' : metadata.name;

    return startSpan(
      {
        name,
        op: `${layerType}.koa`,
        attributes: {
          ...metadata.attributes,
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
        [ATTR_KOA_NAME]: layerPath?.toString(), // TODO(v11): remove, replaced by http.route
        [ATTR_KOA_TYPE]: LAYER_TYPE.ROUTER,
        [HTTP_ROUTE]: layerPath?.toString(),
      },
      name: context._matchedRouteName || `router - ${layerPath}`,
    };
  }
  return {
    attributes: {
      [ATTR_KOA_NAME]: layer.name || 'middleware', // TODO(v11): remove, replaced by code.function.name
      [ATTR_KOA_TYPE]: LAYER_TYPE.MIDDLEWARE,
      [CODE_FUNCTION_NAME]: layer.name || 'middleware',
    },
    name: `middleware - ${layer.name}`,
  };
}

function isLayerIgnored(type: KoaLayerType): boolean {
  return ignoreLayersType.includes(type);
}

/**
 * Set the `http.route` attribute on the root HTTP server span for the current trace.
 *
 * No-op when there is no active span, no root span, or the root span is not an
 * `http.server` span — so this can be called unconditionally without risking
 * attribute pollution on non-HTTP root spans.
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

/**
 * EXPERIMENTAL — orchestrion-driven koa integration. Subscribes to the
 * `orchestrion:koa-compose:compose` channel injected into `koa-compose` and
 * wraps each registered middleware/router layer in a span-creating proxy.
 * Requires the orchestrion runtime hook or bundler plugin.
 */
export const koaChannelIntegration = defineIntegration(_koaChannelIntegration);
