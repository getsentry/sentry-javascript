import type * as diagnosticsChannel from 'node:diagnostics_channel';
import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startInactiveSpan,
  stringMatchesSomePattern,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
import type {
  ExpressIntegrationOptions,
  ExpressLayer,
  ExpressLayerType,
  ExpressRequest,
  ExpressResponse,
  HandleChannelContext,
} from './types';

const ORIGIN = 'auto.http.express';

// `express.name`/`express.type` are Sentry-internal Express attributes (not part
// of `@sentry/conventions`); kept in sync with `@sentry/core`'s OTel-derived
// Express integration so the emitted spans are identical across both code paths.
const ATTR_EXPRESS_NAME = 'express.name';
const ATTR_EXPRESS_TYPE = 'express.type';

let _isInstrumented = false;

export function instrumentExpress(
  options: ExpressIntegrationOptions,
  tracingChannel: typeof diagnosticsChannel.tracingChannel,
): void {
  if (_isInstrumented) {
    return;
  }
  _isInstrumented = true;

  for (const channelName of [CHANNELS.EXPRESS_HANDLE, CHANNELS.ROUTER_HANDLE]) {
    DEBUG_BUILD && debug.log(`[orchestrion:express] subscribing to channel "${channelName}"`);

    bindTracingChannelToSpan(
      tracingChannel<HandleChannelContext>(channelName),
      data => getSpanForLayer(data, options),
      {
        beforeSpanEnd(_span, data) {
          data._sentryCleanup?.();
        },
      },
    );
  }
}

/**
 * Open a span for one layer invocation. Returns `undefined` to opt the layer
 * out (error handlers, or a layer with no active parent trace) — the helper
 * then leaves the active context untouched.
 */
function getSpanForLayer(data: HandleChannelContext, options: ExpressIntegrationOptions): Span | undefined {
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
  // filtered), so don't open a span
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

  // Propagate the route to the root `http.server` span *before* the ignore
  // check, so the transaction is still named even when the layer's own span is
  // ignored — matches the OTel Express integration's `onRouteResolved` timing.
  if (type === 'request_handler' && route) {
    setHttpServerSpanRoute(route);
  }

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

  // Honor `ignoreLayers`/`ignoreLayersType`: skip the span for matching layers.
  if (isLayerIgnored(name, type, options)) {
    return undefined;
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
 * layer's `route.path` holds the registered path and `req.baseUrl` the mount
 * prefix of the enclosing router, so their concatenation is the route.
 *
 * `route.path` isn't always a string: RegExp routes (`app.get(/\/x/, …)`) and
 * arrays of paths (`app.get(['/a', /b/], …)`) are stringified the same way as
 * `@sentry/core`'s Express integration — RegExps via `String()`, arrays joined
 * with `,` — so the transaction name matches (e.g. `GET /\/test\/regex/`).
 */
function getRequestHandlerRoute(layer: ExpressLayer, req: ExpressRequest): string | undefined {
  const rawPath = layer.route?.path;
  const routePath = Array.isArray(rawPath)
    ? rawPath.map(segment => extractRoutePathSegment(segment) ?? '').join(',')
    : extractRoutePathSegment(rawPath);
  if (routePath == null) {
    return undefined;
  }
  const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return `${baseUrl}${routePath}`;
}

/** Stringify a single route path segment (string as-is, RegExp/number via `String()`). */
function extractRoutePathSegment(segment: unknown): string | undefined {
  return typeof segment === 'string'
    ? segment
    : segment instanceof RegExp || typeof segment === 'number'
      ? String(segment)
      : undefined;
}

/**
 * Propagate the resolved route to the root `http.server` span so the
 * transaction gets a parameterized `http.route`. Mirrors `@sentry/node`'s
 * `setHttpServerSpanRouteAttribute`; inlined to keep this package free of
 * `@sentry/node` deps. No-op unless the root span is an `http.server` span.
 */
function setHttpServerSpanRoute(route: string): void {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);
  if (!rootSpan) {
    return;
  }
  if (spanToJSON(rootSpan).data[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'http.server') {
    return;
  }
  rootSpan.setAttribute(HTTP_ROUTE, route);
}

/**
 * Whether a layer should be skipped per the `ignoreLayers`/`ignoreLayersType`
 * options. Matches `@sentry/core`'s Express `isLayerIgnored`: `ignoreLayersType`
 * filters by layer type, `ignoreLayers` matches the layer's name against
 * string/RegExp/predicate patterns (exact string match).
 */
function isLayerIgnored(name: string, type: ExpressLayerType, options: ExpressIntegrationOptions): boolean {
  const { ignoreLayers, ignoreLayersType } = options;

  if (Array.isArray(ignoreLayersType) && ignoreLayersType.includes(type)) {
    return true;
  }

  if (!Array.isArray(ignoreLayers)) {
    return false;
  }

  try {
    return stringMatchesSomePattern(name, ignoreLayers, true);
  } catch {
    return false;
  }
}
