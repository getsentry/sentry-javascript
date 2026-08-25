import { initBaseSdk } from './baseSdk';
import type { CloudflareOptions } from './client';
import { type RequestHandlerWrapperOptions, wrapRequestHandlerWithInit } from './wrapRequestHandlerWithInit';

/**
 * Wraps a cloudflare request handler in Sentry instrumentation.
 *
 * The client is set up with the default integrations that work without the `nodejs_compat`
 * compatibility flag, so that this also works on runtimes that cannot enable it (e.g. Shopify
 * Oxygen). On a runtime that has `nodejs_compat`, pass `defaultIntegrations:
 * getDefaultIntegrations(options)` in `options` to get the full set instead.
 */
export function wrapRequestHandler(
  wrapperOptions: Omit<RequestHandlerWrapperOptions, 'options'> & {
    // `enableOpenTelemetrySetup` is only honored by `init` from `sdk.ts`; this entry point
    // initializes the SDK via `initBaseSdk`, where setting it would have no effect.
    options: Omit<CloudflareOptions, 'enableOpenTelemetrySetup'>;
  },
  handler: (...args: unknown[]) => Response | Promise<Response>,
): Promise<Response> {
  return wrapRequestHandlerWithInit(wrapperOptions, handler, initBaseSdk);
}
