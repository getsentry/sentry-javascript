import type { Integration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { getBaseDefaultIntegrations, initWithDefaultIntegrations } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';
import { getFinalOptions } from './options';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { type RequestHandlerWrapperOptions, wrapRequestHandlerWithInit } from './wrapRequestHandlerWithInit';

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

/**
 * Creates the isolate's cached client while the worker entry module is evaluated, so events captured
 * in global scope are queued. The first instrumented invocation reuses the client and sends them.
 *
 * Injected by `@sentry/cloudflare/vite` as the first import of the worker entry.
 *
 * @internal
 */
export function _INTERNAL_earlyInit(
  optionsCallback: (env: unknown) => CloudflareOptions | undefined,
  env: unknown,
): void {
  try {
    const options = getFinalOptions(optionsCallback(env), env);
    if (options.cacheClient === false) {
      return;
    }

    setAsyncLocalStorageAsyncContextStrategy();
    init(options);
  } catch {
    // Never break worker startup, `withSentry` initializes on the first invocation instead.
  }
}

/**
 * `wrapRequestHandler` backed by `init`, so the request gets the full default integrations and
 * honors `enableOpenTelemetrySetup`. The `@sentry/cloudflare/request` variant deliberately skips
 * both to stay usable without `nodejs_compat`.
 *
 * For framework SDKs building on the main entry point, e.g. SvelteKit, whose OpenTelemetry spans
 * need the tracer provider.
 *
 * @internal
 */
export function _INTERNAL_wrapRequestHandler(
  wrapperOptions: RequestHandlerWrapperOptions,
  handler: (...args: unknown[]) => Response | Promise<Response>,
): Promise<Response> {
  return wrapRequestHandlerWithInit(wrapperOptions, handler, init);
}
