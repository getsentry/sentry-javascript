import * as diagnosticsChannel from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { Env, GetConnInfo, Hono, MiddlewareHandler } from './honoTypes';
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

/**
 * Manually instruments a Hono app for Sentry tracing and returns the Sentry request/response
 * middleware to register — `app.use(honoMiddleware(app))`, as the FIRST middleware.
 *
 * This is the same instrumentation the {@link honoIntegration} sets up automatically via orchestrion,
 * exposed for manual use where the automatic constructor hook cannot run — most notably Cloudflare
 * Workers, where the Hono app is built at module scope and `node:diagnostics_channel` publishing is
 * disallowed there. It is config- and DSN-free: `Sentry.init(...)` must still be called separately.
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

// Subscribing happens at most once, whether reached through the per-client `setup()` path
// (Node/Bun/Deno) or the eager Cloudflare arm below.
let constructorSubscribed = false;

function instrumentHono(options: HonoIntegrationOptions): void {
  if (constructorSubscribed) {
    return;
  }
  constructorSubscribed = true;

  diagnosticsChannel.tracingChannel<ConstructorChannelContext>(CHANNELS.HONO_CONSTRUCTOR).end.subscribe(message => {
    safeChannelCallback(() => {
      const app = (message as ConstructorChannelContext).self;
      if (!isHonoApp(app)) {
        return;
      }

      // We hook the `HonoBase` (base) constructor, so this `end` fires during `new Hono()`'s
      // `super()` — before the `Hono` subclass body assigns `this.router`. `app.use()` needs the
      // router, so if it is not set yet, defer instrumentation to the moment the subclass assigns it.
      // That assignment happens synchronously, right after `super()` returns and before any user route
      // registration, so the Sentry middleware still lands first.
      if ((app as { router?: unknown }).router) {
        instrumentHonoApp(app, options);
      } else {
        instrumentWhenRouterReady(app, options);
      }
    });
  });
}

/**
 * Installs a one-shot accessor for `router` so the first assignment (`this.router = …` in the `Hono`
 * subclass constructor, run right after `super()` returns) restores a plain data property and then
 * instruments the app. Kept synchronous — no microtask — so the Sentry middleware is registered
 * before user code appends any routes.
 */
function instrumentWhenRouterReady<E extends Env>(app: Hono<E>, options: HonoIntegrationOptions): void {
  let routerValue: unknown;
  Object.defineProperty(app, 'router', {
    configurable: true,
    enumerable: true,
    get() {
      return routerValue;
    },
    set(value: unknown) {
      routerValue = value;
      Object.defineProperty(app, 'router', { value, writable: true, configurable: true, enumerable: true });
      safeChannelCallback(() => {
        instrumentHonoApp(app, options);
      });
    },
  });
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

// Cloudflare Workers build the Hono app at module scope, and workerd disallows `diagnostics_channel`
// publish/`runStores` at module scope — so arming the constructor channel there crashes the worker at
// `new Hono()`. Auto-instrumentation via the constructor channel therefore does not run on Cloudflare;
// users register the middleware manually instead (`app.use(honoMiddleware(app))`, exported from
// `@sentry/cloudflare`), which applies the same instrumentation without touching diagnostics_channel.
