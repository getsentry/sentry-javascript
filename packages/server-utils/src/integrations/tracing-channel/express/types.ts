export type ExpressLayerType = 'router' | 'middleware' | 'request_handler';

/**
 * The subset of an Express routing `Layer` we read at handle time. `handle` is
 * the user's middleware/handler; `route` is only set on route-dispatch layers
 * (and carries the parameterized path).
 */
export interface ExpressLayer {
  handle?: { length?: number };
  name?: string;
  path?: string;
  route?: { path?: unknown };
  // Only set on a Route's *inner* method-handler layers (e.g. `'get'`), which
  // run inside the route-dispatch layer we already span.
  method?: string;
}

/** Minimal Express request/response shapes — avoids a hard dep on `node:http`. */
export interface ExpressRequest {
  method?: string;
  baseUrl?: string;
  originalUrl?: string;
}
export interface ExpressResponse {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context`
 * object for `Layer.prototype.handle_request`/`handleRequest`: `self` is the
 * Layer the method was invoked on and `arguments` are `[req, res, next]`.
 *
 * `_sentryCleanup` is ours: a teardown for the `res.on('finish')` listener we
 * register, invoked from `beforeSpanEnd` when the span ends via `next()`.
 * `_sentryStoredLayer` marks that this invocation pushed a layer path (so the
 * matching pop on `asyncStart` stays symmetric).
 */
export interface HandleChannelContext {
  self?: ExpressLayer;
  arguments?: unknown[];
  _sentryCleanup?: () => void;
  _sentryStoredLayer?: boolean;
}

/**
 * The context orchestrion attaches to the `route`/`use` registration channels:
 * `self` is the router the method was invoked on (its freshly-pushed layer is
 * the last entry in `stack`) and `arguments` are the registration args (the
 * first of which is the path pattern).
 */
export interface RegistrationChannelContext {
  self?: { stack?: ExpressLayer[] };
  arguments?: unknown[];
}

type IgnoreMatcher = string | RegExp | ((name: string) => boolean);
export interface ExpressIntegrationOptions {
  /** Ignore specific based on their name */
  ignoreLayers?: IgnoreMatcher[];
  /** Ignore specific layers based on their type */
  ignoreLayersType?: ExpressLayerType[];
}
