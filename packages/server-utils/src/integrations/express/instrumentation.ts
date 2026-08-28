import type * as diagnosticsChannel from 'node:diagnostics_channel';
import { HTTP_ROUTE, SENTRY_OP } from '@sentry/conventions/attributes';
import { MIDDLEWARE } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  captureException,
  debug,
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  hasSpanStreamingEnabled,
  ROUTER_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  stringMatchesSomePattern,
  withActiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import {
  getActualMatchedRoute,
  getConstructedRoute,
  getLayerPath,
  getLayerRegisteredPath,
  popLayerPath,
  pushLayerPath,
  setLayerRegisteredPath,
} from './route';
import type {
  ExpressIntegrationOptions,
  ExpressLayer,
  ExpressLayerType,
  ExpressRequest,
  ExpressResponse,
  ExpressShouldHandleError,
  HandleChannelContext,
  MiddlewareError,
  RegistrationChannelContext,
} from './types';
import { shouldCaptureError } from './utils';
import { isExpressErrorHandled, markExpressErrorHandled } from './error-handled';
import { setHttpServerSpanRouteAttribute } from '../../utils/setHttpServerSpanRouteAttribute';

const ORIGIN = 'auto.http.express';

// `express.name`/`express.type` are Sentry-internal Express attributes (not part
// of `@sentry/conventions`); kept in sync with `@sentry/core`'s OTel-derived
// Express integration so the emitted spans are identical across both code paths.
const ATTR_EXPRESS_NAME = 'express.name';
const ATTR_EXPRESS_TYPE = 'express.type';

// TODO(conventions): Replace `'handler'` and `'router'` with their span op constants once they are released in `@sentry/conventions`.
const EXPRESS_TYPE_TO_SPAN_OP: Record<string, string> = {
  middleware: MIDDLEWARE,
  request_handler: 'handler',
  router: 'router',
};

const NOOP = (): void => {};

let _isInstrumented = false;

export function instrumentExpress(
  options: ExpressIntegrationOptions,
  tracingChannel: typeof diagnosticsChannel.tracingChannel,
): void {
  if (_isInstrumented) {
    return;
  }
  _isInstrumented = true;

  // Record each layer's registered path *pattern* as it is registered, so the
  // matched route can be reconstructed with its parameters intact at request
  // time. Only the `end` event matters (the layer is on the router's stack by
  // then); the others are required by the subscriber type, so no-op them.
  for (const channelName of [CHANNELS.EXPRESS_REGISTER, CHANNELS.ROUTER_REGISTER]) {
    tracingChannel<RegistrationChannelContext>(channelName).subscribe({
      start: NOOP,
      asyncStart: NOOP,
      asyncEnd: NOOP,
      error: NOOP,
      end: captureRegisteredLayerPath,
    });
  }

  for (const channelName of [CHANNELS.EXPRESS_HANDLE, CHANNELS.ROUTER_HANDLE]) {
    const channel = tracingChannel<HandleChannelContext>(channelName);

    bindTracingChannelToSpan(channel, data => getSpanForLayer(data, options), {
      beforeSpanEnd(_span, data) {
        data._sentryCleanup?.();
      },
    });

    // Pop the layer path when the layer hands off via `next`. `asyncStart` fires
    // when `next` is called and *before* the downstream layer runs, so the
    // per-request path chain reflects only the current chain when each layer
    // reconstructs its route. The `error` event captures throws at the layer
    // level (see `captureLayerError`), before any user error-handling middleware.
    channel.subscribe({
      start: NOOP,
      asyncEnd: NOOP,
      end: NOOP,
      error: data => captureLayerError(data, options.shouldHandleError),
      asyncStart: popLayerPathForLayer,
    });
  }
}

/**
 * Capture an error surfaced on a layer's `handle_request` channel — the throw
 * site, which runs before any user error-handling middleware.
 *
 * Each request's error is handled exactly once: the same error surfaces on every
 * parent layer's `error` event as it bubbles, and a user may also still call the
 * deprecated `setupExpressErrorHandler`. We mark the request the first time we
 * see it, so later layers and that middleware defer to this decision — the
 * integration is the single registered handler and its `shouldHandleError` wins.
 * This deliberately does not rely on `captureException`'s global dedup, which is
 * only set when an error is actually captured and so cannot express a
 * "deliberately skipped" decision (leaving the deprecated middleware free to
 * capture it and override `shouldHandleError`).
 *
 * `shouldHandleError` is the raw integration option: `false` disables capture
 * entirely, a function customizes the gate, and `undefined` falls back to
 * {@link defaultShouldHandleError}.
 */
export function captureLayerError(
  data: HandleChannelContext,
  shouldHandleError: ExpressShouldHandleError | undefined,
): void {
  const error = data.error;

  // `next('route')` / `next('router')` are Express control-flow signals, not errors.
  if (!error || error === 'route' || error === 'router') {
    return;
  }

  // Take responsibility for this request's error exactly once (see the doc comment above). The marker
  // lives on the request — the same instance across every bubbling layer and the error middleware,
  // and always a mutable object, unlike the thrown value which may be frozen or a primitive. Mark
  // before the `shouldHandleError` gate so a "skip" decision also suppresses the deprecated middleware.
  const request = data.arguments?.[0] as ExpressRequest | undefined;
  if (request) {
    if (isExpressErrorHandled(request)) {
      return;
    }
    markExpressErrorHandled(request);
  }

  if (!shouldCaptureError(shouldHandleError, error as MiddlewareError)) {
    return;
  }

  const capture = (): string =>
    captureException(error, {
      mechanism: {
        type: 'auto.http.express',
        handled: false,
      },
    });

  // The channel's `error` event runs outside the layer span's async context, so
  // re-activate the bound span (when present) to parent the error event to the
  // request's trace instead of capturing it context-free.
  if (data._sentrySpan) {
    withActiveSpan(data._sentrySpan, capture);
  } else {
    capture();
  }
}

/** Record the freshly-registered layer's path pattern from a `route`/`use` call. */
function captureRegisteredLayerPath(data: RegistrationChannelContext): void {
  const stack = data.self?.stack;
  if (!Array.isArray(stack)) {
    return;
  }
  const layer = stack[stack.length - 1];
  if (layer) {
    setLayerRegisteredPath(layer, getLayerPath(data.arguments ?? []));
  }
}

/** Pop the path a layer pushed once it hands control onward via `next`. */
function popLayerPathForLayer(data: HandleChannelContext): void {
  if (!data._sentryStoredLayer) {
    return;
  }
  // Clear the marker first so a layer that (incorrectly) calls `next` more than
  // once can't pop again and take a parent's entry off the stack with it.
  data._sentryStoredLayer = false;
  const req = data.arguments?.[0] as ExpressRequest | undefined;
  if (req) {
    popLayerPath(req);
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

  // Push this layer's registered path onto the request's chain so a
  // `request_handler` can reconstruct the full route with parameters intact
  // (`req.baseUrl` only exposes the *resolved* mount prefix). The matching pop
  // happens on `asyncStart` when the layer hands off via `next`.
  const registeredPath = getLayerRegisteredPath(layer);
  if (registeredPath != null) {
    pushLayerPath(req, registeredPath);
    data._sentryStoredLayer = true;
  }

  // `constructedRoute` (the full registered pattern) names the span/transaction;
  // `matchedRoute` (validated against the request URL) is the `http.route`.
  // Computed for every layer type (not just `request_handler`) so routes served
  // by mounted middleware (`app.use('/trpc', handler)`) still propagate their
  // path to the root `http.server` span — mirroring the OTel Express integration,
  // which resolves the route on every layer. Without this, such transactions keep
  // the raw URL name (e.g. `GET /trpc/foo` instead of `GET /trpc`).
  const constructedRoute = getConstructedRoute(req);
  const matchedRoute = constructedRoute != null ? getActualMatchedRoute(req, constructedRoute) : undefined;

  const name =
    type === 'request_handler'
      ? constructedRoute || 'request handler'
      : type === 'router'
        ? (layer.path ?? '/')
        : (layer.name ?? '<anonymous>');

  // Propagate the route to the root `http.server` span *before* the ignore
  // check, so the transaction is still named even when the layer's own span is
  // ignored — matches the OTel Express integration's `onRouteResolved` timing.
  if (matchedRoute) {
    setHttpServerSpanRouteAttribute(matchedRoute);
  }

  if (type === 'request_handler' && constructedRoute) {
    const isolationScope = getIsolationScope();
    if (isolationScope !== getDefaultIsolationScope()) {
      const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
      isolationScope.setTransactionName(`${method} ${constructedRoute}`);
    } else {
      DEBUG_BUILD &&
        debug.warn(
          '[instrumentation:express] Isolation scope is still default isolation scope - skipping transaction name',
        );
    }
  }

  // Honor `ignoreLayers`/`ignoreLayersType`: skip the span for matching layers.
  // We intentionally do NOT pop the pushed path here (unlike OTel Express, which
  // pops on ignore): the path is still popped on `asyncStart` when the layer
  // calls `next`, so a following sibling isn't polluted, while an ignored
  // *router* keeps its mount prefix on the stack for the sub-stack it dispatches
  // — so routes under an ignored router stay correct. The only entries that
  // never pop come from layers that end the response without `next()`, and those
  // sit on a per-request store that is discarded when the request ends.
  if (isLayerIgnored(name, type, options)) {
    return undefined;
  }

  const client = getClient();
  // With span streaming, span names have to be low cardinality, so router spans are named after their route.
  const isStreamedRouterSpan = type === 'router' && !!client && hasSpanStreamingEnabled(client);

  const span = startInactiveSpan({
    name: isStreamedRouterSpan ? matchedRoute || ROUTER_SPAN_NAME_FALLBACK : name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
      [SENTRY_OP]: EXPRESS_TYPE_TO_SPAN_OP[type],
      [ATTR_EXPRESS_NAME]: name,
      [ATTR_EXPRESS_TYPE]: type,
      ...(matchedRoute ? { [HTTP_ROUTE]: matchedRoute } : {}),
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
