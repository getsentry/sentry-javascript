import type { Integration } from '@sentry/core';
import { getCurrentScope, setCurrentClient } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  GLOBAL_OBJ,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { makeFlushLock } from './flush';
import { cacheClient, getCachedClient } from './clientCache';
import { fetchIntegration } from './integrations/fetch';
import { httpServerIntegration } from './integrations/httpServer';
import { INTEGRATION_NAME as SPOTLIGHT_INTEGRATION_NAME, spotlightIntegration } from './integrations/spotlight';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/**
 * Instantiate the channel-subscriber factories the `@sentry/cloudflare/vite`
 * plugin registered on the global marker. The plugin splices a small snippet
 * into each instrumented module that `.set`s its factory here (keyed by module
 * name), so the marker holds one factory per package actually bundled.
 *
 * The marker is read directly instead of importing the factories, so a worker
 * built without the plugin — where the channels never fire — ships none of this
 * code.
 */
function getRegisteredChannelIntegrations(): Integration[] {
  const registered = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations;

  return registered ? [...registered.values()].map(factory => factory()) : [];
}

/**
 * Get the default integrations that run on any Workers-compatible runtime, i.e. without the
 * `nodejs_compat` compatibility flag.
 *
 * `getDefaultIntegrations` in `sdk.ts` extends this set with the integrations that do depend on
 * Node.js APIs. Keeping the two apart is what allows `wrapRequestHandler` to stay usable on runtimes
 * that cannot enable `nodejs_compat`, such as Shopify Oxygen.
 */
export function getBaseDefaultIntegrations(options: CloudflareOptions): Integration[] {
  return [
    // The Dedupe integration should not be used in workflows because we want to
    // capture all step failures, even if they are the same error.
    ...(options.enableDedupe === false ? [] : [dedupeIntegration()]),
    eventFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    httpServerIntegration(),
    requestDataIntegration(),
    consoleIntegration(),
    // The orchestrion diagnostics-channel subscribers (mysql, pg, …). The
    // `@sentry/cloudflare/vite` plugin injects the channels at build time and,
    // next to each, a snippet that registers the matching subscriber factory on
    // the global marker. Read from there instead of importing them so bundles
    // built without the plugin — where the channels would never fire — don't
    // ship the code.
    ...getRegisteredChannelIntegrations(),
  ];
}

/**
 * Initializes the Cloudflare SDK with the passed default integrations.
 *
 * The default integrations are injected rather than imported so that this module stays free of
 * Node.js-only code. `request.ts` — which backs both `wrapRequestHandler` and the
 * `@sentry/cloudflare/request` entry point, and therefore has to work on runtimes without the
 * `nodejs_compat` compatibility flag — creates its client from here instead of from `sdk.ts`.
 *
 * The client is cached and reused across invocations within the same isolate,
 * unless `cacheClient: false` is passed. This avoids the
 * per-invocation cost of constructing a new client, and it is what makes
 * Durable Object telemetry reliable: a per-invocation client is disposed at
 * the end of the handler, and in a Durable Object there is no `waitUntil`
 * boundary that reliably extends execution, so spans/events that end after
 * disposal would otherwise be lost.
 */
export function initWithDefaultIntegrations(
  options: CloudflareOptions,
  getDefaultIntegrationsImpl: (options: CloudflareOptions) => Integration[],
): CloudflareClient | undefined {
  const cacheEnabled = options.cacheClient !== false;

  if (cacheEnabled) {
    const cached = getCachedClient();
    if (cached?.getTransport()) {
      getCurrentScope().update(options.initialScope);
      setCurrentClient(cached);
      cached.setExecutionContext(options.ctx);
      return cached;
    }
  }

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrationsImpl(options);
  }

  // A cached client outlives any single invocation, so binding it to one
  // invocation's flush lock would make later flushes wait on that invocation's
  // waitUntil work forever. Eager delivery replaces the flush lock's purpose.
  const invocationContext = options.ctx;
  const flushLock = !cacheEnabled && invocationContext ? makeFlushLock(invocationContext) : undefined;
  delete options.ctx;

  const clientOptions: CloudflareClientOptions = {
    ...options,
    cacheClient: cacheEnabled,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
    flushLock,
    invocationContext,
  };

  /*! rollup-include-development-only */
  if (options.spotlight && !clientOptions.integrations.some(({ name }) => name === SPOTLIGHT_INTEGRATION_NAME)) {
    clientOptions.integrations.push(
      spotlightIntegration({
        sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined,
      }),
    );
  }
  /*! rollup-include-development-only-end */

  const client = initAndBind(CloudflareClient, clientOptions) as CloudflareClient;

  if (cacheEnabled && client) {
    cacheClient(client);
  }

  // An instrumented module that first evaluates AFTER this init (e.g. a driver
  // lazily required on first use) stores its subscriber factory on the global
  // marker too late for the default-integrations snapshot above. Its injected
  // snippet emits this event right after storing the factory, so install the
  // integration on the live client here. `addIntegration` dedupes by
  // integration name, so already-installed integrations are no-ops.
  client.on('orchestrion.module-injected', moduleName => {
    const factory = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.get(moduleName);
    if (factory) {
      client.addIntegration(factory());
    }
  });

  return client;
}

/**
 * Initializes the Cloudflare SDK with only the default integrations from
 * {@link getBaseDefaultIntegrations}, i.e. those that work without the `nodejs_compat`
 * compatibility flag.
 */
export function initBaseSdk(options: CloudflareOptions): CloudflareClient | undefined {
  return initWithDefaultIntegrations(options, getBaseDefaultIntegrations);
}
