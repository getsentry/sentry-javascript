import type { Integration } from '@sentry/core';
import { getBaseDefaultIntegrations, initWithDefaultIntegrations } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';

/**
 * Get the default integrations for the Cloudflare SDK.
 */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  return getBaseDefaultIntegrations(options);
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  // Like most Node-based SDKs, Cloudflare defaults to running without a Sentry OpenTelemetry tracer
  // provider. Scope isolation is handled by the entrypoint wrappers' AsyncLocalStorage strategy.
  options.enableOpenTelemetrySetup ??= false;

  // Opt-in only: when `enableOpenTelemetrySetup` is `true`, set up a custom trace provider so spans
  // emitted via `@opentelemetry/api` are captured by Sentry. See the option's docs for the caveats.
  if (options.enableOpenTelemetrySetup) {
    setupOpenTelemetryTracer();
  }

  return initWithDefaultIntegrations(options, getDefaultIntegrations);
}
