import type { Integration, Span } from '@sentry/core';

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
 * matching pop on `asyncStart` stays symmetric). `_sentrySpan` is the span bound
 * for this layer by `bindTracingChannelToSpan`, and `error` is present on the
 * channel's `error` event.
 */
export interface HandleChannelContext {
  self?: ExpressLayer;
  arguments?: unknown[];
  _sentryCleanup?: () => void;
  _sentryStoredLayer?: boolean;
  _sentrySpan?: Span;
  error?: unknown;
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

/** An Express error carrying an optional HTTP status, in the various shapes middleware use. */
export interface MiddlewareError extends Error {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: {
    statusCode?: number | string;
  };
}

/** Callback deciding whether an error should be captured; `false` disables capture entirely. */
export type ExpressShouldHandleError = ((error: MiddlewareError) => boolean) | false;

type IgnoreMatcher = string | RegExp | ((name: string) => boolean);
export interface ExpressIntegrationOptions {
  /** Ignore specific based on their name */
  ignoreLayers?: IgnoreMatcher[];
  /** Ignore specific layers based on their type */
  ignoreLayersType?: ExpressLayerType[];
  /**
   * Callback deciding whether an error thrown from a route handler should be
   * captured and sent to Sentry.
   *
   * By default, 5xx errors (and errors without a resolvable status) are sent,
   * while 3xx and 4xx errors are not. Errors are captured as soon as they are
   * thrown — before any user error-handling middleware runs.
   *
   * Set to `false` to disable Sentry's automatic error capture entirely; you can
   * then capture errors yourself from your own error handler via
   * `Sentry.captureException`.
   *
   * @example
   *
   * ```javascript
   * Sentry.init({
   *   integrations: [
   *     Sentry.expressIntegration({
   *       shouldHandleError(error) {
   *         return (error.statusCode ?? 500) >= 500;
   *       },
   *     }),
   *   ],
   * });
   * ```
   */
  shouldHandleError?: ExpressShouldHandleError;
}

export interface ExpressIntegration extends Integration {
  getShouldHandleError: () => ExpressShouldHandleError | undefined;
}
