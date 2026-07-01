import * as diagnosticsChannel from 'node:diagnostics_channel';
import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import type { IntegrationFn, Span } from '@sentry/core';
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
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
import type { ExpressLayer, ExpressLayerType, ExpressRequest, ExpressResponse, HandleChannelContext } from './types';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Express' integration is omitted from the default set.
const INTEGRATION_NAME = 'Express' as const;

const ORIGIN = 'auto.http.express';

// `express.name`/`express.type` are Sentry-internal Express attributes (not part
// of `@sentry/conventions`); kept in sync with `@sentry/core`'s OTel-derived
// Express integration so the emitted spans are identical across both code paths.
const ATTR_EXPRESS_NAME = 'express.name';
const ATTR_EXPRESS_TYPE = 'express.type';

function getLayerType(layer: ExpressLayer): ExpressLayerType {
  if (layer.name === 'router') {
    return 'router';
  }
  // `bound dispatch` (v4) / `handle` — the route-dispatch layer created by `router.route()`.
  if (layer.name === 'bound dispatch' || layer.name === 'handle') {
    return 'request_handler';
  }
  return 'middleware';
}

/**
 * The full matched route for a route-dispatch layer, e.g. `/users/:id`. The
 * layer's `route.path` holds the parameterized path and `req.baseUrl` the mount
 * prefix of the enclosing router, so their concatenation is the route.
 */
function getRequestHandlerRoute(layer: ExpressLayer, req: ExpressRequest): string | undefined {
  const routePath = typeof layer.route?.path === 'string' ? layer.route.path : undefined;
  if (routePath == null) {
    return undefined;
  }
  const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return `${baseUrl}${routePath}`;
}

/**
 * Propagate the resolved route to the root `http.server` span so the
 * transaction gets a parameterized `http.route`. Mirrors `@sentry/node`'s
 * `setHttpServerSpanRouteAttribute`; inlined to keep this package free of
 * `@sentry/node` deps. No-op unless the root span is an `http.server` span.
 */
function setHttpServerSpanRoute(rootSpan: Span | undefined, route: string): void {
  if (!rootSpan) {
    return;
  }
  if (spanToJSON(rootSpan).data[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'http.server') {
    return;
  }
  rootSpan.setAttribute(HTTP_ROUTE, route);
}

const _expressChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      for (const channelName of [CHANNELS.EXPRESS_HANDLE, CHANNELS.ROUTER_HANDLE]) {
        DEBUG_BUILD && debug.log(`[orchestrion:express] subscribing to channel "${channelName}"`);

        waitForTracingChannelBinding(() => {
          bindTracingChannelToSpan(
            diagnosticsChannel.tracingChannel<HandleChannelContext>(channelName),
            getSpanForLayer,
            {
              beforeSpanEnd(_span, data) {
                data._sentryCleanup?.();
              },
            },
          );
        });
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven Express integration.
 *
 * Subscribes to the `orchestrion:express:handle` (Express v4) and
 * `orchestrion:router:handle` (Express v5, via the `router` package)
 * diagnostics_channels that the orchestrion code transform injects into the
 * routing layer's request handler (`Layer.prototype.handle_request` /
 * `handleRequest`). One span is opened per layer invocation — producing the
 * same spans as the OTel Express instrumentation.
 *
 * Requires the orchestrion runtime hook or bundler plugin to be active — wire
 * that up via `experimentalUseDiagnosticsChannelInjection()`.
 */
export const expressChannelIntegration = defineIntegration(_expressChannelIntegration);

/**
 * Open a span for one layer invocation. Returns `undefined` to opt the layer
 * out (error handlers, or a layer with no active parent trace) — the helper
 * then leaves the active context untouched.
 */
function getSpanForLayer(data: HandleChannelContext): Span | undefined {
  const layer = data.self;
  const args = data.arguments;
  if (!layer || !Array.isArray(args)) {
    return undefined;
  }

  // Express only treats a 4-arg handler as an error handler and skips it in
  // the normal request pipeline; match the OTel integration and don't trace it.
  if (layer.handle?.length === 4) {
    return undefined;
  }

  // A Route dispatches to its handlers via the same `handle_request` method,
  // but those inner layers already run inside the route-dispatch layer's
  // `request_handler` span. They carry `.method` (and no `.route`); skip them
  // so we emit one span per route, matching the OTel Express integration.
  if (layer.method && !layer.route) {
    return undefined;
  }

  const req = args[0] as ExpressRequest | undefined;
  const res = args[1] as ExpressResponse | undefined;
  if (!req) {
    return undefined;
  }

  // No active parent span means this request is being ignored (unsampled /
  // filtered), so don't open a span — matches the OTel Express integration
  // and avoids starting an orphan trace.
  if (!getActiveSpan()) {
    return undefined;
  }

  const type = getLayerType(layer);
  const route = type === 'request_handler' ? getRequestHandlerRoute(layer, req) : undefined;

  const name =
    type === 'request_handler'
      ? (route ?? 'request handler')
      : type === 'router'
        ? (layer.path ?? '/')
        : (layer.name ?? '<anonymous>');

  if (type === 'request_handler' && route) {
    const isolationScope = getIsolationScope();
    if (isolationScope !== getDefaultIsolationScope()) {
      const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
      isolationScope.setTransactionName(`${method} ${route}`);
    } else {
      DEBUG_BUILD &&
        debug.warn(
          '[orchestrion:express] Isolation scope is still default isolation scope - skipping transaction name',
        );
    }
  }

  const span = startInactiveSpan({
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.express`,
      [ATTR_EXPRESS_NAME]: name,
      [ATTR_EXPRESS_TYPE]: type,
      ...(route ? { [HTTP_ROUTE]: route } : {}),
    },
  });

  if (type === 'request_handler' && route) {
    setHttpServerSpanRoute(getRootSpan(span), route);
  }

  // A layer that sends the response (route handlers, typically) never calls
  // `next`, so the channel's `asyncEnd` never fires. End on the response's
  // `finish` in that case. When `next` *is* called, the helper ends the span
  // (via `asyncEnd`) and `beforeSpanEnd` removes this now-redundant listener.
  if (res && typeof res.once === 'function') {
    const onFinish = (): void => {
      span.end();
    };
    res.once('finish', onFinish);
    data._sentryCleanup = () => res.removeListener('finish', onFinish);
  }

  return span;
}
