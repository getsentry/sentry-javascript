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
import { isMiddleware } from './isMiddleware';
import { extractPathname, isInternalRequestSpanActive } from './patchAppRequest';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';
import type { SentryHonoMiddlewareOptions } from './types';

// Matches the `@sentry/hono` SDK's integration name, so the SDK filters its own out of the
// forwarded defaults and the two never stack.
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
 * Resolves the runtime's `getConnInfo` helper once, best-effort.
 *
 * Cloudflare Workers can't `require()` out of a bundle at runtime, so there conn-info is left to the
 * platform's `requestDataIntegration`. On Node/Bun/Deno a missing optional peer dependency degrades
 * to `undefined`, which just skips the connection-info attributes.
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
    // `createRequire` resolves relative to its argument's directory, so a never-loaded dummy path
    // roots resolution at the app directory, where the runtime helper is installed.
    const appRequire = createRequire(`${process.cwd()}/noop.js`);
    cachedGetConnInfo = (appRequire(specifier) as { getConnInfo?: GetConnInfo }).getConnInfo;
  } catch {
    DEBUG_BUILD && debug.log(`[instrumentation:hono] could not resolve \`getConnInfo\` from "${specifier}"`);
    cachedGetConnInfo = undefined;
  }

  return cachedGetConnInfo;
}

/**
 * Manually instruments a Hono app and returns the Sentry request/response middleware to register
 * first: `app.use(honoMiddleware(app))`.
 *
 * Only needed when neither the Sentry runtime hook nor the bundler plugin is active — otherwise
 * {@link honoIntegration} does this automatically. Safe to combine with the automatic instrumentation
 * (request handling is deduplicated per request, `applyPatches` is idempotent). `Sentry.init(...)`
 * must still be called separately.
 */
export function honoMiddleware<E extends Env>(app: Hono<E>, options: HonoIntegrationOptions = {}): MiddlewareHandler {
  applyPatches(app);

  return createHonoRequestMiddleware({
    getConnInfo: resolveGetConnInfo(),
    shouldHandleError: options.shouldHandleError,
  });
}

// A Hono `matchResult[0]` entry: `[[handler, routeMeta], paramIndexMap]` — `compose` runs the
// handler (`entry[0][0]`) and the `matchedRoutes` getter reads `routeMeta` (`entry[0][1]`).
// oxlint-disable-next-line typescript/no-explicit-any
type MatchedHandlerEntry = [[any, any], any];

// `router.match` may hand back a cached handler array for a route, so track the lists we've already
// prepended into and never inject the Sentry middleware twice.
const _injectedHandlerLists = new WeakSet<object>();

// The request/response middleware is stateless (per-request state lives on the request scope) and
// `options` is fixed, so build it once and reuse it across every dispatched Context.
let cachedRequestMiddleware: MiddlewareHandler | undefined;

/**
 * Per-request Context hook. `#dispatch` builds `new Context(req, { matchResult })` before its
 * single-handler fast-path check, so from the live `matchResult` we:
 *  1. wrap the matched middleware handlers for spans (route handlers are covered by the request span);
 *  2. prepend the Sentry request/response middleware — it drives route naming, request data and error
 *     capture from inside the chain, and forces the ≥2-handler `compose` path so the fast-path is
 *     never taken.
 *
 * Running per request (no module-scope state) is what lets this work on Cloudflare.
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

  // Classify matched handlers with the same positional heuristic as `wrapSubAppMiddleware`: within a
  // method+path group the last handler is the route handler and earlier ones are middleware; `.use()`
  // registers as method 'ALL' with a lone genuine-middleware entry, so fall back to arity there.
  // Position is needed because a route handler declared with an unused `next` param has middleware arity.
  const lastIndexByKey = new Map<string, number>();
  for (const [i, entry] of handlers.entries()) {
    const routeMeta = entry?.[0]?.[1] as { method?: string; path?: string } | undefined;
    if (routeMeta?.method != null && routeMeta.path != null) {
      // \0 is a collision-free delimiter: it cannot appear in a valid HTTP method or URL path.
      lastIndexByKey.set(`${routeMeta.method}\0${routeMeta.path}`, i);
    }
  }

  for (const [i, entry] of handlers.entries()) {
    const pair = entry?.[0];
    const handler = pair?.[0];
    if (typeof handler !== 'function') {
      continue;
    }

    const routeMeta = pair?.[1] as { method?: string; path?: string } | undefined;
    const isMW =
      routeMeta?.method != null && routeMeta.path != null
        ? lastIndexByKey.get(`${routeMeta.method}\0${routeMeta.path}`) !== i ||
          (routeMeta.method === 'ALL' && isMiddleware(handler))
        : isMiddleware(handler);

    if (isMW) {
      pair[0] = wrapMiddlewareWithSpan(handler as MiddlewareHandler);
    }
  }

  // Prepend the Sentry request/response middleware. `routeMeta` is what the `matchedRoutes` getter
  // exposes; its middleware arity keeps route-name resolution from picking it.
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
      // Alongside the manual middleware, the instance `app.request` Proxy has already opened this
      // span and is calling through — returning `undefined` (no span) avoids nesting a duplicate.
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
  // The Context constructor's `end` fires synchronously inside `new Context()`, before `#dispatch`
  // reads `matchResult[0].length`, so the injected middleware is in place for the same request.
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
 * Automatically instruments Hono applications for Sentry tracing.
 *
 * Hooks Hono's per-request internals (the `Context` constructor and `app.request`) via the
 * orchestrion diagnostics channel — so instrumentation happens per request, never at module scope,
 * which is what lets it work on Cloudflare Workers with no manual middleware. Enabled by default in
 * the Node, Bun, Deno and Cloudflare SDKs; requires the Sentry runtime hook or bundler plugin.
 *
 * Registering `@sentry/hono`'s `sentry()` middleware manually alongside it is safe — request handling
 * is deduplicated per request.
 */
export const honoIntegration = defineIntegration(_honoIntegration);
