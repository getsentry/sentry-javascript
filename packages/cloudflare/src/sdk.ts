import type { Integration } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  dedupeIntegration,
  functionToStringIntegration,
  getGlobalScope,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  setCurrentClient,
  spanStreamingIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { fetchIntegration } from './integrations/fetch';
import { honoIntegration } from './integrations/hono';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  const sendDefaultPii = options.sendDefaultPii ?? false;
  return [
    // The Dedupe integration should not be used in workflows because we want to
    // capture all step failures, even if they are the same error.
    ...(options.enableDedupe === false ? [] : [dedupeIntegration()]),
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    honoIntegration(),
    // TODO(v11): the `include` object should be defined directly in the integration based on `sendDefaultPii`
    requestDataIntegration(sendDefaultPii ? undefined : { include: { cookies: false } }),
    consoleIntegration(),
  ];
}

/**
 * Initializes the cloudflare SDK.
 *
 * If a client already exists on the global scope, it will be reused and bound to the current scope.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  // Reuse existing client from global scope - just bind it to the current scope
  const existingClient = getGlobalScope().getClient<CloudflareClient>();
  if (existingClient) {
    setCurrentClient(existingClient);
    return existingClient;
  }

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  // ctx is no longer used for client creation - flush is handled per-request
  delete options.ctx;

  const resolvedIntegrations = getIntegrationsToSetup(options);
  if (options.traceLifecycle === 'stream' && !resolvedIntegrations.some(i => i.name === 'SpanStreaming')) {
    resolvedIntegrations.push(spanStreamingIntegration());
  }

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: resolvedIntegrations,
    transport: options.transport || makeCloudflareTransport,
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

  const client = initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
  // Also set on global scope for reuse across requests
  getGlobalScope().setClient(client);
  return client;
}
