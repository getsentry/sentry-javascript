import {
  debug,
  getActiveSpan,
  getOriginalFunction,
  markFunctionWrapped,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  type WrappedFunction,
} from '@sentry/core';
import type { Env, Hono } from 'hono';
import { DEBUG_BUILD } from '../debug-build';

const INTERNAL_REQUEST_OP = 'hono.request';
const INTERNAL_REQUEST_ORIGIN = 'auto.http.hono.internal_request';

// Widened type to allow forwarding opaque args (env bindings, execution context)
type LooseRequestFn = (input: string | Request | URL, requestInit?: RequestInit, ...rest: unknown[]) => unknown;

function extractPathname(input: string | Request | URL): string {
  if (typeof input === 'string') {
    return /^https?:\/\//.test(input) ? new URL(input).pathname : input;
  }

  return input instanceof Request ? new URL(input.url).pathname : input.pathname;
}

/**
 * Patches `app.request()` on a Hono instance so that each internal dispatch
 * is traced as a `hono.request` span — child of whatever span is active at
 * the call site.
 *
 * `.request()` is a class field (arrow function), so this must run per-instance.
 * Idempotent: safe to call multiple times on the same instance.
 */
export function patchAppRequest<E extends Env>(app: Hono<E>): void {
  if (getOriginalFunction(app.request as unknown as WrappedFunction)) {
    DEBUG_BUILD && debug.log('[hono] app.request already patched — skipping.');
    return;
  }

  const originalRequest = app.request as LooseRequestFn;

  const patchedRequest = (input: string | Request | URL, requestInit?: RequestInit, ...rest: unknown[]) => {
    if (!getActiveSpan()) {
      return originalRequest(input, requestInit, ...rest);
    }

    let method = requestInit?.method ?? (input instanceof Request ? input.method : 'GET');
    method = method.toUpperCase();

    const path = extractPathname(input);

    return startSpan(
      {
        name: `${method} ${path}`,
        op: INTERNAL_REQUEST_OP,
        onlyIfParent: true,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: INTERNAL_REQUEST_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: INTERNAL_REQUEST_ORIGIN,
        },
      },
      () => originalRequest(input, requestInit, ...rest),
    );
  };

  markFunctionWrapped(patchedRequest as unknown as WrappedFunction, originalRequest as unknown as WrappedFunction);
  app.request = patchedRequest as typeof app.request;

  DEBUG_BUILD && debug.log('[hono] Patched app.request for internal dispatch tracing.');
}
