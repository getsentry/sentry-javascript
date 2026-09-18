import { SENTRY_OP } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import {
  debug,
  getActiveSpan,
  getOriginalFunction,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  type WrappedFunction,
} from '@sentry/core';
import type { Env, Hono } from './honoTypes';
import { DEBUG_BUILD } from '../../debug-build';

const INTERNAL_REQUEST_OP = HTTP_SERVER;
const INTERNAL_REQUEST_ORIGIN = 'auto.http.hono.internal_request';

// Re-entrancy guard shared with the orchestrion channel subscriber
// (`instrumentInternalRequests` in `honoIntegration`). Both wrap the same `app.request`: this Proxy
// calls through to the original, which — when the default integration is active — is orchestrion-
// instrumented and publishes to the request channel. Without this guard the two stack a second,
// identical internal-request span inside the first. The Proxy owns the span; the channel subscriber
// reads this flag and opts out. `Symbol.for` on `globalThis` keeps it shared across copies of
// `@sentry/server-utils`, matching the request-handling dedup markers.
const INTERNAL_REQUEST_SPAN_ACTIVE = Symbol.for('sentry.hono.internalRequestSpanActive');
type GuardCarrier = { [INTERNAL_REQUEST_SPAN_ACTIVE]?: boolean };

/** Whether the instance `app.request` Proxy is currently opening an internal-request span. */
export function isInternalRequestSpanActive(): boolean {
  return !!(globalThis as GuardCarrier)[INTERNAL_REQUEST_SPAN_ACTIVE];
}

function setInternalRequestSpanActive(active: boolean): void {
  (globalThis as GuardCarrier)[INTERNAL_REQUEST_SPAN_ACTIVE] = active;
}

function stripQueryAndHash(path: string): string {
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}

/**
 * Derive the span-name path from an `app.request()` argument, mirroring Hono's own handling so the
 * name matches the path actually dispatched, with the query/hash stripped so they can't leak into
 * span names or inflate cardinality.
 *
 * Hono treats an absolute `http(s)://` input as a full URL and everything else as a path under
 * `http://localhost` (see `hono-base`'s `request`). We prepend that same fixed host rather than
 * resolving the string as a URL reference: resolution rewrites protocol-relative inputs
 * (`//example.com/foo` → host `example.com`, dropping the segment Hono keeps in the path) and throws
 * on inputs Hono accepts (`//`, `http:`). This runs before the underlying dispatch, so it must never
 * throw — the `catch` is a final guard against any remaining malformed input.
 */
export function extractPathname(input: unknown): string {
  if (typeof input === 'string') {
    try {
      const url = /^https?:\/\//.test(input)
        ? new URL(input)
        : new URL(`http://localhost${input.startsWith('/') ? '' : '/'}${input}`);
      return url.pathname;
    } catch {
      return stripQueryAndHash(input);
    }
  }

  if (input instanceof Request) {
    return new URL(input.url).pathname;
  }

  return input instanceof URL ? input.pathname : '/';
}

/**
 * Patches `app.request()` on a Hono instance so that each internal dispatch
 * is traced as an `http.server` span — child of whatever span is active at
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

  const originalRequest = app.request;

  app.request = new Proxy(originalRequest, {
    apply(_target, thisArg, args: [string | Request | URL, RequestInit?, ...unknown[]]) {
      const [input, requestInit, ...rest] = args;

      if (!getActiveSpan()) {
        return Reflect.apply(_target, thisArg, args);
      }

      let method = requestInit?.method ?? (input instanceof Request ? input.method : 'GET');
      method = method.toUpperCase();

      const path = extractPathname(input);

      return startSpan(
        {
          name: `${method} ${path}`,
          onlyIfParent: true,
          attributes: {
            [SENTRY_OP]: INTERNAL_REQUEST_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: INTERNAL_REQUEST_ORIGIN,
          },
        },
        () => {
          // The flag only needs to cover the synchronous dispatch start, where the orchestrion
          // channel would fire and open its duplicate span. `Reflect.apply` returns the pending
          // promise synchronously, so `finally` clears it before any nested `.request()` runs.
          setInternalRequestSpanActive(true);
          try {
            return Reflect.apply(_target, thisArg, [input, requestInit, ...rest]);
          } finally {
            setInternalRequestSpanActive(false);
          }
        },
      );
    },
    get(target, prop, receiver) {
      if (prop === '__sentry_original__') {
        return originalRequest;
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  DEBUG_BUILD && debug.log('[hono] Patched app.request for internal dispatch tracing.');
}
