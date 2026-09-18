import * as diagnosticsChannel from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { Env, GetConnInfo, Hono, MiddlewareHandler } from './honoTypes';
import { CHANNELS } from '../../orchestrion/channels';
import { honoModuleNames } from '../../orchestrion/config/hono';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel';
import { applyPatches } from './applyPatches';
import { createHonoRequestMiddleware } from './createHonoMiddleware';
import { extractPathname, isInternalRequestSpanActive } from './patchAppRequest';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';
import type { SentryHonoMiddlewareOptions } from './types';

// Same name as the Hono SDK's integration. When this default is enabled, the `@sentry/hono` SDK
// filters the `'Hono'` integration out of the defaults it forwards, so the two never stack.
const INTEGRATION_NAME = 'Hono' as const;

const INTERNAL_REQUEST_ORIGIN = 'auto.http.hono.internal_request';

export interface HonoIntegrationOptions extends SentryHonoMiddlewareOptions {}

const globalAny = globalThis as { Bun?: unknown; Deno?: unknown; navigator?: { userAgent?: string } };
const isBun = typeof globalAny.Bun !== 'undefined';
const isDeno = typeof globalAny.Deno !== 'undefined';
const isCloudflare = globalAny.navigator?.userAgent === 'Cloudflare-Workers';

let connInfoResolved = false;
let cachedGetConnInfo: GetConnInfo | undefined;

/**
 * Resolve the runtime-specific `getConnInfo` helper, once, best-effort.
 *
 * Each runtime ships it from a different subpackage. Cloudflare Workers cannot `require()` a module
 * out of a bundle at runtime, so there conn-info is left to the platform's `requestDataIntegration`;
 * `createRequire` covers the require-capable runtimes (Node/Bun/Deno) under both ESM and CJS. Any
 * failure (optional peer dependency not installed) degrades to `undefined`, which just skips the
 * connection-info attributes.
 */
function resolveGetConnInfo(): GetConnInfo | undefined {
  if (connInfoResolved) {
    return cachedGetConnInfo;
  }
  connInfoResolved = true;

  const specifier = isBun ? 'hono/bun' : isDeno ? 'hono/deno' : isCloudflare ? undefined : '@hono/node-server/conninfo';

  if (!specifier) {
    return undefined;
  }

  try {
    // `createRequire` treats its argument as a filename and resolves from its directory, so a dummy
    // file (never loaded) roots resolution at the app directory — where the runtime helper lives.
    const appRequire = createRequire(`${process.cwd()}/noop.js`);
    cachedGetConnInfo = (appRequire(specifier) as { getConnInfo?: GetConnInfo }).getConnInfo;
  } catch {
    DEBUG_BUILD && debug.log(`[instrumentation:hono] could not resolve \`getConnInfo\` from "${specifier}"`);
    cachedGetConnInfo = undefined;
  }

  return cachedGetConnInfo;
}

/**
 * Manually instruments a Hono app for Sentry tracing and returns the Sentry request/response
 * middleware to register — `app.use(honoMiddleware(app))`, as the FIRST middleware.
 *
 * The {@link honoIntegration} default instruments Hono automatically (see below), so this is only
 * needed for setups where neither the Sentry runtime hook nor the bundler plugin is active. It is
 * config- and DSN-free: `Sentry.init(...)` must still be called separately.
 *
 * Safe to combine with the automatic instrumentation: the request handling is deduplicated per
 * request and `applyPatches` is idempotent per app.
 *
 * `getConnInfo` is resolved for the current runtime (Node/Bun/Deno); on Cloudflare it is left to the
 * platform's request-data handling.
 */
export function honoMiddleware<E extends Env>(app: Hono<E>, options: HonoIntegrationOptions = {}): MiddlewareHandler {
  applyPatches(app);

  return createHonoRequestMiddleware({
    getConnInfo: resolveGetConnInfo(),
    shouldHandleError: options.shouldHandleError,
  });
}

// A Hono `matchResult[0]` entry: `[[handler, routeMeta], paramIndexMap]`. `compose` reads the handler
// at `entry[0][0]`; the `matchedRoutes` getter reads `routeMeta` at `entry[0][1]`.
// oxlint-disable-next-line typescript/no-explicit-any
type MatchedHandlerEntry = [[any, any], any];

// Match-result handler lists we've already injected into. `router.match` may return a cached array
// for a given route, so guard against prepending the Sentry middleware more than once.
const _injectedHandlerLists = new WeakSet<object>();

// The Sentry request/response middleware is stateless (all per-request state lives on the request
// scope), so build it once and reuse it across every dispatched Context instead of recreating it on
// each `new Context()`. `options` is fixed for the single channel subscription, so a single cached
// instance is always correct.
let cachedRequestMiddleware: MiddlewareHandler | undefined;

/**
 * Per-request Context hook: the heart of the automatic instrumentation.
 *
 * `#dispatch` builds `new Context(req, { matchResult })` before its single-handler fast-path check,
 * passing the live `matchResult` array. We:
 *  1. wrap the already-matched MIDDLEWARE handlers (arity ≥ 2) for spans — route handlers (arity < 2)
 *     are covered by the request span and left as-is;
 *  2. prepend the Sentry request/response middleware, so it runs first in the composed chain. That
 *     both drives route naming / request data / error capture (from inside the chain, with the
 *     Context) and forces the ≥2-handler `compose` path, so there is no fast-path gap.
 *
 * All of this runs per request, so it works on Cloudflare (no module-scope publish) and needs no
 * app-instance patching or app-construction hook.
 */
function injectHonoInstrumentation(
  // oxlint-disable-next-line typescript/no-explicit-any
  message: { arguments?: any[] },
  options: HonoIntegrationOptions,
): void {
  const ctorOptions = message.arguments?.[1] as { matchResult?: [MatchedHandlerEntry[], unknown] } | undefined;
  const handlers = ctorOptions?.matchResult?.[0];
  if (!Array.isArray(handlers) || _injectedHandlerLists.has(handlers)) {
    return;
  }
  _injectedHandlerLists.add(handlers);

  // Wrap matched middleware handlers (arity ≥ 2). `wrapMiddlewareWithSpan` is idempotent and skips
  // Sentry's own middleware, so this is safe even if a handler is shared across routes.
  for (const entry of handlers) {
    const pair = entry?.[0];
    const handler = pair?.[0];
    if (typeof handler === 'function' && (handler as { length: number }).length >= 2) {
      pair[0] = wrapMiddlewareWithSpan(handler as MiddlewareHandler);
    }
  }

  // Prepend the Sentry request/response middleware. `routeMeta` is what the `matchedRoutes` getter
  // reads; a middleware-arity handler means route-name resolution skips it.
  const middleware = (cachedRequestMiddleware ??= createHonoRequestMiddleware({
    getConnInfo: resolveGetConnInfo(),
    shouldHandleError: options.shouldHandleError,
  }));
  const routeMeta = { basePath: '/', path: '/*', method: 'ALL', handler: middleware };
  handlers.unshift([[middleware, routeMeta], {}]);
}

/**
 * Traces Hono's internal `app.request(...)` dispatches (sub-app-to-sub-app fetches) as `http.server`
 * child spans, but only when there is a parent span (so a top-level `.request()` is not traced).
 */
function instrumentInternalRequests(): void {
  bindTracingChannelToSpan(
    // oxlint-disable-next-line typescript/no-explicit-any
    diagnosticsChannel.tracingChannel<{ arguments: any[] }>(CHANNELS.HONO_REQUEST),
    data => {
      // When the manual middleware is used alongside this default integration, the instance
      // `app.request` Proxy already opened this span and is calling through to us — don't nest a
      // duplicate. `getSpan` returning `undefined` opts the payload out cleanly.
      if (isInternalRequestSpanActive()) {
        return undefined;
      }

      const [input, requestInit] = data.arguments;
      const method = (
        (requestInit as RequestInit | undefined)?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      return startInactiveSpan({
        name: `${method} ${extractPathname(input)}`,
        attributes: {
          [SENTRY_OP]: HTTP_SERVER,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: INTERNAL_REQUEST_ORIGIN,
        },
      });
    },
    { requiresParentSpan: true },
  );
}

function instrumentHono(options: HonoIntegrationOptions): void {
  // Per-request Context hook — injects the Sentry middleware and wraps matched middleware handlers.
  // The `end` of the Context constructor fires synchronously during `new Context()`, before
  // `#dispatch` reads `matchResult[0].length`, so the prepend takes effect for the same request.
  diagnosticsChannel
    // oxlint-disable-next-line typescript/no-explicit-any
    .tracingChannel<{ arguments: any[] }>(CHANNELS.HONO_CONTEXT)
    .end.subscribe(message => {
      // oxlint-disable-next-line typescript/no-explicit-any
      safeChannelCallback(() => injectHonoInstrumentation(message as { arguments?: any[] }, options));
    });

  instrumentInternalRequests();
}

const _honoIntegration = ((options: HonoIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, honoModuleNames, instrumentHono, [options]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Automatically instruments Hono applications for Sentry.
 *
 * Instruments Hono through its per-request internals (the `Context` constructor and `app.request`)
 * via the orchestrion diagnostics channel: on each request it injects the Sentry request/response
 * middleware into the matched handler chain, names the transaction from the matched route, records
 * request data, captures unhandled errors, and creates middleware and internal-request spans.
 * Enabled by default in the Node, Bun, Deno and Cloudflare SDKs. Requires the Sentry runtime hook or
 * bundler plugin.
 *
 * Because everything happens per request (never at module scope), it works on Cloudflare Workers
 * out of the box, with no manual middleware registration.
 *
 * Registering the `sentry()` middleware from `@sentry/hono` manually alongside this is safe — the
 * request handling is deduplicated per request, so it runs exactly once.
 */
export const honoIntegration = defineIntegration(_honoIntegration);
