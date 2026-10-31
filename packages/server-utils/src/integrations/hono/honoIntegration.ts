import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, startInactiveSpan } from '@sentry/core';
import type { HonoRuntime } from './connInfo';
import type { Env, Hono, MatchedHandler, MiddlewareHandler } from './honoTypes';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { CHANNELS } from '../../orchestrion/channels';
import { honoModuleNames } from '../../orchestrion/config/hono';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel';
import { applyPatches } from './applyPatches';
import { INTERNAL_REQUEST_ORIGIN } from './constants';
import { createHonoRequestMiddleware } from './createHonoMiddleware';
import { getMiddlewareFlags } from './isMiddleware';
import { isMatchedHandlerList } from './matchResult';
import { extractPathname, isInternalRequestSpanActive } from './patchAppRequest';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan';
import type { SentryHonoMiddlewareOptions } from './types';

// Matches the `@sentry/hono` SDK's integration name, so the SDK filters its own out of the
// forwarded defaults and the two never stack.
const INTEGRATION_NAME = 'Hono' as const;

export interface HonoIntegrationOptions extends SentryHonoMiddlewareOptions {}

const globalAny = globalThis as { Bun?: unknown; Deno?: unknown; navigator?: { userAgent?: string } };
const isBun = typeof globalAny.Bun !== 'undefined';
const isDeno = typeof globalAny.Deno !== 'undefined';
const isCloudflare = globalAny.navigator?.userAgent === 'Cloudflare-Workers';

const runtime: HonoRuntime = isBun ? 'bun' : isDeno ? 'deno' : isCloudflare ? 'cloudflare' : 'node';

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
    runtime,
    shouldHandleError: options.shouldHandleError,
  });
}

function wrapMatchedMiddleware(handlers: MatchedHandler[]): void {
  const middlewareFlags = getMiddlewareFlags(handlers.map(([[, route]]) => route));
  for (const [i, [pair]] of handlers.entries()) {
    if (middlewareFlags[i]) {
      pair[0] = wrapMiddlewareWithSpan(pair[0]);
    }
  }
}

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
  message: OrchestrionChannelContext,
  requestMiddleware: MiddlewareHandler,
  injectedHandlerLists: WeakSet<object>,
): void {
  const ctorOptions = message.arguments?.[1] as { matchResult?: [unknown[], unknown] } | undefined;
  const handlers = ctorOptions?.matchResult?.[0];
  if (!Array.isArray(handlers) || injectedHandlerLists.has(handlers)) {
    return;
  }
  injectedHandlerLists.add(handlers);

  if (isMatchedHandlerList(handlers)) {
    wrapMatchedMiddleware(handlers);
  }

  // Prepend the Sentry request/response middleware. Its arity marks it as a middleware, so its `/*`
  // never becomes the route name.
  const routeMeta = { basePath: '/', path: '/*', method: 'ALL', handler: requestMiddleware };
  handlers.unshift([[requestMiddleware, routeMeta], {}]);
}

/**
 * Traces Hono's internal `app.request(...)` dispatches (sub-app-to-sub-app fetches) as `http.server`
 * child spans, but only when there is a parent span (so a top-level `.request()` is not traced).
 */
function instrumentInternalRequests(): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.HONO_REQUEST),
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
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: HTTP_SERVER,
          [SENTRY_ORIGIN]: INTERNAL_REQUEST_ORIGIN,
        },
      });
    },
  );
}

/**
 * Wires the per-request Hono hooks (Context constructor + internal `app.request`) to the diagnostics
 * channel.
 *
 * Note:
 * Because the Sentry request/response middleware is prepended into the matched-handler list (`matchResult[0]`),
 * it also shows up in `c.req.matchedRoutes` — apps that inspect `matchedRoutes`
 * will see an extra `ALL /*` entry (the Sentry middleware) that they did not register themselves.
 */
function instrumentHono(options: HonoIntegrationOptions): void {
  // `router.match` may hand back a cached handler array for a route, so track the lists we've already
  // prepended into and never inject the Sentry middleware twice.
  const injectedHandlerLists = new WeakSet<object>();

  // The request/response middleware is stateless (per-request state lives on the request scope) and
  // `options` is fixed, so build it once and reuse it across every dispatched Context.
  const requestMiddleware = createHonoRequestMiddleware({
    runtime,
    shouldHandleError: options.shouldHandleError,
  });

  // The Context constructor's `end` fires synchronously inside `new Context()`, before `#dispatch`
  // reads `matchResult[0].length`, so the injected middleware is in place for the same request.
  diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.HONO_CONTEXT).end.subscribe(message => {
    safeChannelCallback(() =>
      injectHonoInstrumentation(message as OrchestrionChannelContext, requestMiddleware, injectedHandlerLists),
    );
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
