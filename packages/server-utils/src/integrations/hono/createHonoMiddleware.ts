import { addNonEnumerableProperty, getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import type { Context, GetConnInfo, MiddlewareHandler } from './honoTypes';
import { captureContextError, requestHandler, responseHandler } from './middlewareHandlers';
import type { SentryHonoMiddlewareOptions } from './types';

// Marks the Sentry request/response middleware so the span-wrapping patches never turn it into a
// middleware span — most importantly when an auto-instrumented sub-app carrying this middleware is
// mounted into a parent and `wrapSubAppMiddleware` wraps its handlers. Read by `wrapMiddlewareWithSpan`.
export const SENTRY_HONO_MIDDLEWARE = '__SENTRY_HONO_MIDDLEWARE__';

// `Symbol.for` (global registry) so the markers are shared even if this module is evaluated from more
// than one copy of `@sentry/server-utils`.
const HONO_REQUEST_HANDLED = Symbol.for('sentry.hono.requestHandled');
// The effective `shouldHandleError` for the request, recorded even by a deduplicated middleware so a
// user-provided callback wins over the default (see below).
const HONO_SHOULD_HANDLE_ERROR = Symbol.for('sentry.hono.shouldHandleError');

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
 * The object that carries the per-request dedup/config markers.
 *
 * Prefer the per-request isolation scope over the Hono `Context`, so the request is treated as one
 * even when several Sentry middlewares run for it:
 * - a mounted sub-app that carries its own auto-registered middleware (same context, same scope),
 * - an internal `app.request()` dispatch, which runs in a *new* Hono context but the *same*
 *   isolation scope (so it must not re-record the transaction name or overwrite the request data),
 * - a manual `sentry()` middleware registered alongside the auto-instrumentation.
 *
 * When there is no per-request isolation scope (the default scope), fall back to the context so that
 * at least same-context duplicates are still deduplicated.
 */
function getRequestScope(context: Context): Record<PropertyKey, unknown> {
  const isolationScope = getIsolationScope();
  const target: object = isolationScope === getDefaultIsolationScope() ? context : isolationScope;
  return target as Record<PropertyKey, unknown>;
}

/**
 * Builds the core Sentry request/response Hono middleware: it names the transaction, records the
 * request, and captures unhandled context errors around `next()`.
 *
 * Idempotent per request (see {@link getRequestScope}), so duplicate registrations — a manual
 * `sentry()` alongside the auto-instrumentation, mounted sub-apps, internal `.request()` dispatches —
 * are all safe and run the handling exactly once.
 *
 * A user-provided `shouldHandleError` still takes effect even when the middleware carrying it is
 * deduplicated behind the auto-instrumentation (which is prepended first, per request, from the
 * `Context` constructor hook): the deduplicated middleware records its callback on the request scope, and the
 * middleware that actually runs `responseHandler` uses it in preference to its own default.
 */
export function createHonoRequestMiddleware(options: CreateHonoRequestMiddlewareOptions = {}): MiddlewareHandler {
  const middleware: MiddlewareHandler = async (context, next) => {
    const scope = getRequestScope(context);

    const shouldHandleError = options.resolveShouldHandleError
      ? options.resolveShouldHandleError(context)
      : options.shouldHandleError;
    // Record a user-provided callback so it wins even if this middleware is deduplicated. Runs before
    // the dedup check so a later manual `sentry({ shouldHandleError })` overrides the auto default.
    if (shouldHandleError) {
      addNonEnumerableProperty(scope, HONO_SHOULD_HANDLE_ERROR, shouldHandleError);
    }

    if (scope[HONO_REQUEST_HANDLED]) {
      await next();
      // A deduplicated middleware still reports errors from its own context — e.g. an inner
      // `.request()` whose route threw but whose failed response the outer handler swallowed, so the
      // outer context never sees the error. Route naming and request data stay owned by the request
      // that ran first, so only the error is captured here.
      const dedupShouldHandleError =
        (scope[HONO_SHOULD_HANDLE_ERROR] as SentryHonoMiddlewareOptions['shouldHandleError']) ?? shouldHandleError;
      captureContextError(context, dedupShouldHandleError);
      return;
    }
    addNonEnumerableProperty(scope, HONO_REQUEST_HANDLED, true);

    requestHandler(context, options.getConnInfo);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    const effectiveShouldHandleError =
      (scope[HONO_SHOULD_HANDLE_ERROR] as SentryHonoMiddlewareOptions['shouldHandleError']) ?? shouldHandleError;
    responseHandler(context, effectiveShouldHandleError);
  };

  addNonEnumerableProperty(middleware, SENTRY_HONO_MIDDLEWARE, true);
  return middleware;
}
