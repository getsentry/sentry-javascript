import type { Integration } from '@sentry/core';
import { getCurrentScope, setCurrentClient } from '@sentry/core';
import { getBaseDefaultIntegrations, initWithDefaultIntegrations } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';
import { cacheClient, getCachedClient } from './clientCache';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';

// Test-only helper, re-exported here so tests can reset the global client cache.
export { _clearGlobalClientCache } from './clientCache';

/**
 * Get the default integrations for the Cloudflare SDK.
 */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  return getBaseDefaultIntegrations(options);
}

/**
 * Initializes the cloudflare SDK.
 *
 * The client is cached and reused across invocations within the same isolate,
 * unless `cacheClient: false` is passed. This avoids the
 * per-invocation cost of constructing a new client, and it is what makes
 * Durable Object telemetry reliable: a per-invocation client is disposed at
 * the end of the handler, and in a Durable Object there is no `waitUntil`
 * boundary that reliably extends execution, so spans/events that end after
 * disposal would otherwise be lost.
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

  const cacheEnabled = options.cacheClient !== false;

  if (cacheEnabled) {
    // Normalize the flag so the client marks itself as cached.
    options.cacheClient = true;
  }

  if (cacheEnabled && options.dsn) {
    const cached = getCachedClient();
    // A cached client that has lost its transport was disposed. Replace it rather
    // than returning a dead client for the rest of the isolate's lifetime.
    if (cached?.getTransport()) {
      // Mirror the two scope side effects of `initAndBind`, which only runs on first
      // creation. Without the re-bind the scope keeps whatever client a previous init
      // left behind — which may have been disposed since — and without the update
      // `initialScope` would apply only to an isolate's very first invocation.
      getCurrentScope().update(options.initialScope);
      setCurrentClient(cached);
      // The cached client outlives the invocation that created it, so its eager
      // sends must be registered with the current invocation's waitUntil.
      cached.setExecutionContext(options.ctx);
      return cached;
    }
  }

  const client = initWithDefaultIntegrations(options, getDefaultIntegrations, { skipFlushLock: cacheEnabled });

  if (cacheEnabled && client && options.dsn) {
    cacheClient(client);
  }

  return client;
}
