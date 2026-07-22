import type { Integration } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  GLOBAL_OBJ,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { makeFlushLock } from './flush';
import { httpServerIntegration } from './integrations/httpServer';
import { fetchIntegration } from './integrations/fetch';
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

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  // TODO(v11): Drop this transitional gating and let `requestDataIntegration` rely on the resolved
  // `dataCollection` defaults directly. Until then, preserve the historical Cloudflare behavior of not
  // attaching cookies unless the user explicitly opts in via `sendDefaultPii` or `dataCollection.cookies`.
  // eslint-disable-next-line typescript/no-deprecated
  const cookiesEnabled = options.sendDefaultPii || options.dataCollection?.cookies != null;
  return [
    // The Dedupe integration should not be used in workflows because we want to
    // capture all step failures, even if they are the same error.
    ...(options.enableDedupe === false ? [] : [dedupeIntegration()]),
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line typescript/no-deprecated
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    httpServerIntegration(),
    requestDataIntegration(cookiesEnabled ? undefined : { include: { cookies: false } }),
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
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const flushLock = options.ctx ? makeFlushLock(options.ctx) : undefined;
  delete options.ctx;

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
    flushLock,
  };

  /**
   * The Cloudflare SDK is not OpenTelemetry native, however, we set up some OpenTelemetry compatibility
   * via a custom trace provider.
   * This ensures that any spans emitted via `@opentelemetry/api` will be captured by Sentry.
   * HOWEVER, big caveat: This does not handle custom context handling, it will always work off the current scope.
   * This should be good enough for many, but not all integrations.
   */
  if (!options.skipOpenTelemetrySetup) {
    setupOpenTelemetryTracer();
  }

  return initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
}
