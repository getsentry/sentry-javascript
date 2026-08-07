import type { Integration } from '@sentry/core';
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
import { fetchIntegration } from './integrations/fetch';
import { httpServerIntegration } from './integrations/httpServer';
import { INTEGRATION_NAME as SPOTLIGHT_INTEGRATION_NAME, spotlightIntegration } from './integrations/spotlight';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/**
 * Instantiate the channel-subscriber factories the `@sentry/cloudflare/vite`
 * plugin registered on the global marker. The plugin splices a small snippet
 * into each instrumented module that `.set`s its factory here (keyed by export
 * name), so the marker holds one factory per package actually bundled.
 *
 * The marker is read directly instead of importing the factories, so a worker
 * built without the plugin — where the channels never fire — ships none of this
 * code.
 * TODO(v11): Use `@sentry/server-utils/orchestrion` once we move to `nodejs_compat` by default.
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
 */
export function initWithDefaultIntegrations(
  options: CloudflareOptions,
  getDefaultIntegrationsImpl: (options: CloudflareOptions) => Integration[],
  { skipFlushLock = false }: { skipFlushLock?: boolean } = {},
): CloudflareClient | undefined {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrationsImpl(options);
  }

  // A cached client outlives any single invocation, so binding it to one
  // invocation's flush lock would make later flushes wait on that invocation's
  // waitUntil work forever. Eager delivery replaces the flush lock's purpose.
  const invocationContext = options.ctx;
  const flushLock = !skipFlushLock && invocationContext ? makeFlushLock(invocationContext) : undefined;
  delete options.ctx;

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
    // Like most Node-based SDKs, Cloudflare defaults to running without a Sentry OpenTelemetry tracer
    // provider. Scope isolation is handled by the entrypoint wrappers' AsyncLocalStorage strategy.
    skipOpenTelemetrySetup: options.skipOpenTelemetrySetup ?? true,
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

  // Opt-in only: when `skipOpenTelemetrySetup` is `false`, set up a custom trace provider so spans
  // emitted via `@opentelemetry/api` are captured by Sentry. See the option's docs for the caveats.
  if (!clientOptions.skipOpenTelemetrySetup) {
    setupOpenTelemetryTracer();
  }

  return initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
}

/**
 * Initializes the Cloudflare SDK with only the default integrations from
 * {@link getBaseDefaultIntegrations}, i.e. those that work without the `nodejs_compat`
 * compatibility flag.
 */
export function initBaseSdk(options: CloudflareOptions): CloudflareClient | undefined {
  return initWithDefaultIntegrations(options, getBaseDefaultIntegrations);
}
