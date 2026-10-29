import { initBaseSdk } from './baseSdk';
import type { CloudflareOptions } from './client';
import { type RequestHandlerWrapperOptions, wrapRequestHandlerWithInit } from './wrapRequestHandlerWithInit';

/**
 * Wraps a cloudflare request handler in Sentry instrumentation.
 *
 * The client uses the same default integrations as `init`, without setting up an OpenTelemetry
 * tracer provider. This entry point also works on runtimes that cannot enable the `nodejs_compat`
 * compatibility flag, such as Shopify Oxygen.
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

export { httpServerIntegration } from './integrations/httpServer';
