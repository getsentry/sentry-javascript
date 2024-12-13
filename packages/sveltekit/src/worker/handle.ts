import { CloudflareOptions, continueTrace, wrapRequestHandler } from '@sentry/cloudflare';
import { getDefaultIntegrations as getDefaultCloudflareIntegrations } from '@sentry/cloudflare';
import type { Handle } from '@sveltejs/kit';

import { sentryHandleGeneric, SentryHandleOptions } from '../server-common/handle';
import { rewriteFramesIntegration } from '../server-common/rewriteFramesIntegration';

/**
 * A SvelteKit handle function that wraps the request for Sentry error and
 * performance monitoring.
 *
 * This doesn't currently use OTEL, as it isn't available outside of Node
 *
 * Usage:
 * ```
 * // src/hooks.server.ts
 * import { sentryHandle } from '@sentry/sveltekit';
 *
 * export const handle = sentryHandle();
 *
 * // Optionally use the `sequence` function to add additional handlers.
 * // export const handle = sequence(sentryHandle(), yourCustomHandler);
 * ```
 */
export function sentryHandle(handlerOptions?: SentryHandleOptions): Handle {
  const sentryRequestHandler = sentryHandleGeneric(continueTrace, handlerOptions);

  return sentryRequestHandler;
}

/** Initializes Sentry SvelteKit Cloudflare SDK
 *  This should be before the sentryHandle() call.
 * */
export function initCloudflareSentryHandle(options: CloudflareOptions): Handle {
  const opts: CloudflareOptions = {
    defaultIntegrations: [...getDefaultCloudflareIntegrations(options), rewriteFramesIntegration()],
    ...options,
  };

  const handleInitSentry: Handle = ({ event, resolve }) => {
    // if event.platform exists (should be there in a cloudflare worker), then do the cloudflare sentry init
    return event.platform
      ? wrapRequestHandler(
        {
          options: opts,
          request: event.request,
          // @ts-expect-error This will exist in Cloudflare
          context: event.platform.context,
        },
        () => resolve(event),
      )
      : resolve(event);
  };

  return handleInitSentry;
}
