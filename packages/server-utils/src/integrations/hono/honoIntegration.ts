import * as diagnosticsChannel from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { Env, GetConnInfo, Hono } from './honoTypes';
import { CHANNELS } from '../../orchestrion/channels';
import { honoModuleNames } from '../../orchestrion/config/hono';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { safeChannelCallback } from '../../tracing-channel';
import { applyPatches } from './applyPatches';
import { createHonoRequestMiddleware } from './createHonoMiddleware';
import type { SentryHonoMiddlewareOptions } from './types';

// Same name as the Hono SDK's integration. When this default is enabled, the `@sentry/hono` SDK
// filters the `'Hono'` integration out of the defaults it forwards, so the two never stack.
const INTEGRATION_NAME = 'Hono' as const;

// oxlint-disable-next-line typescript/no-explicit-any
type HonoAny = Hono<any>;

interface ConstructorChannelContext {
  arguments: unknown[];
  self?: unknown;
}

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

function isHonoApp(app: unknown): app is HonoAny {
  return (
    typeof app === 'object' &&
    app !== null &&
    typeof (app as { use?: unknown }).use === 'function' &&
    Array.isArray((app as { routes?: unknown }).routes)
  );
}

/**
 * Registers the Sentry request/response middleware as the FIRST middleware on the app and applies
 * the Hono span patches. The middleware is registered through the app's original `use` — before
 * `applyPatches` wraps `use` — so the Sentry middleware itself is not turned into a middleware span.
 */
function instrumentHonoApp<E extends Env>(app: Hono<E>, options: HonoIntegrationOptions): void {
  const middleware = createHonoRequestMiddleware({
    getConnInfo: resolveGetConnInfo(),
    shouldHandleError: options.shouldHandleError,
  });

  app.use(middleware);

  applyPatches(app);
}

// Subscribing happens at most once, whether reached through the per-client `setup()` path
// (Node/Bun/Deno) or the eager Cloudflare arm below.
let constructorSubscribed = false;

function instrumentHono(options: HonoIntegrationOptions): boolean {
  if (constructorSubscribed) {
    return false;
  }
  constructorSubscribed = true;

  diagnosticsChannel.tracingChannel<ConstructorChannelContext>(CHANNELS.HONO_CONSTRUCTOR).end.subscribe(message => {
    safeChannelCallback(() => {
      const app = (message as ConstructorChannelContext).self;
      if (isHonoApp(app)) {
        instrumentHonoApp(app, options);
      }
    });
  });

  return true;
}

const _honoIntegration = ((options: HonoIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // The subscriber opens no spans at subscribe time (it only registers middleware), so a missing
      // async-context binding must not defer it.
      invokeOrchestrionInstrumentation(client, honoModuleNames, instrumentHono, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Automatically instruments Hono applications for Sentry.
 *
 * Hooks the `Hono` constructor via the orchestrion diagnostics channel and, on every new app,
 * registers the Sentry request/response middleware and applies the span patches. Enabled by default
 * in the Node, Bun, Deno and Cloudflare SDKs. Requires the Sentry runtime hook or bundler plugin.
 *
 * Registering the `sentry()` middleware from `@sentry/hono` manually alongside this is safe — the
 * request handling is deduplicated per request, so it runs exactly once.
 */
export const honoIntegration = defineIntegration(_honoIntegration);

// Cloudflare only: the Hono app is built at module scope, before any per-request `init()` creates a
// client, so the per-client `setup()` path used on Node/Bun/Deno would subscribe too late to catch
// the `Hono` constructor. The orchestrion snippet injected into `hono` imports this module at hono's
// module-eval — before `new Hono()` runs — so arming here catches it. Gated to Cloudflare so the
// other runtimes keep the lazy, opt-out-respecting `setup()` path.
//
// The result is assigned to a global so the call is not tree-shaken out of the Cloudflare bundle
// (`@sentry/server-utils` is `sideEffects: false`) — the same technique the injected snippet uses.
// TODO: Remove this hack again once we handle this properly in Cloudflare SDK
// The some problem exists for e.g. express etc, this is just a bandaid
if (isCloudflare) {
  (globalThis as Record<string, unknown>).__SENTRY_HONO_CLOUDFLARE_ARMED__ = instrumentHono({});
}
