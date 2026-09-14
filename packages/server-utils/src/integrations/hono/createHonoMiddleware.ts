import { addNonEnumerableProperty } from '@sentry/core';
import type { Context, GetConnInfo, MiddlewareHandler } from './honoTypes';
import { requestHandler, responseHandler } from './middlewareHandlers';
import type { SentryHonoMiddlewareOptions } from './types';

// `Symbol.for` (global registry) so the marker is shared even if this module is
// evaluated from more than one copy of `@sentry/server-utils` — the auto
// instrumentation and a manually registered `sentry()` middleware then still
// dedupe against each other.
const HONO_REQUEST_HANDLED = Symbol.for('sentry.hono.requestHandled');

export interface CreateHonoRequestMiddlewareOptions {
  /**
   * Runtime-specific `getConnInfo` helper (e.g. `@hono/node-server/conninfo`, `hono/bun`).
   * Optional — connection-info attributes are simply skipped when it is not provided.
   */
  getConnInfo?: GetConnInfo;

  /** Static `shouldHandleError` callback (Node/Bun/Deno). */
  shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError'];

  /**
   * Resolves `shouldHandleError` per request from the context. Cloudflare accepts
   * middleware options as a function of `env`, so the callback is only known once a
   * request comes in. When provided, this wins over the static `shouldHandleError`.
   */
  resolveShouldHandleError?: (context: Context) => SentryHonoMiddlewareOptions['shouldHandleError'];
}

/**
 * Builds the core Sentry request/response Hono middleware: it names the transaction, records the
 * request, and captures unhandled context errors around `next()`.
 *
 * The handler is idempotent per request. Whichever Sentry middleware runs first marks the context;
 * any further Sentry middleware on the same request (a manual `sentry()` registration alongside the
 * auto-instrumentation, or a sub-app that carries its own copy) just passes through. This is what
 * makes duplicate registrations safe.
 */
export function createHonoRequestMiddleware(options: CreateHonoRequestMiddlewareOptions = {}): MiddlewareHandler {
  return async (context, next) => {
    if ((context as unknown as Record<PropertyKey, unknown>)[HONO_REQUEST_HANDLED]) {
      return next();
    }
    addNonEnumerableProperty(context, HONO_REQUEST_HANDLED, true);

    requestHandler(context, options.getConnInfo);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    const shouldHandleError = options.resolveShouldHandleError
      ? options.resolveShouldHandleError(context)
      : options.shouldHandleError;
    responseHandler(context, shouldHandleError);
  };
}
