import { initBaseSdk } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { type RequestHandlerWrapperOptions, wrapRequestHandlerWithInit } from './wrapRequestHandlerWithInit';

// Test-only helper, re-exported here so tests can reset the global client cache.
export { _clearGlobalClientCache } from './clientCache';

export { getDefaultIntegrations } from './baseSdk';

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

  return initBaseSdk(options);
}

/**
 * `wrapRequestHandler` backed by `init`, so the request honors `enableOpenTelemetrySetup`. The
 * `@sentry/cloudflare/request` variant deliberately skips it to stay usable without `nodejs_compat`.
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
