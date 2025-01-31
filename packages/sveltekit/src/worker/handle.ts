import { type CloudflareOptions, wrapRequestHandler } from '@sentry/cloudflare';
import { getDefaultIntegrations as getDefaultCloudflareIntegrations } from '@sentry/cloudflare';
import type { Handle } from '@sveltejs/kit';

import { addNonEnumerableProperty } from '@sentry/core';
import { rewriteFramesIntegration } from '../server-common/rewriteFramesIntegration';

/** Initializes Sentry SvelteKit Cloudflare SDK
 *  This should be before the sentryHandle() call.
 *
 *  In the Node export, this is a stub that does nothing.
 */
export function initCloudflareSentryHandle(options: CloudflareOptions): Handle {
  const opts: CloudflareOptions = {
    defaultIntegrations: [...getDefaultCloudflareIntegrations(options), rewriteFramesIntegration()],
    ...options,
  };

  const handleInitSentry: Handle = ({ event, resolve }) => {
    // if event.platform exists (should be there in a cloudflare worker), then do the cloudflare sentry init
    if (event.platform) {
      // This is an optional local that the `sentryHandle` handler checks for to avoid double isolation
      // In Cloudflare the `wrapRequestHandler` function already takes care of
      // - request isolation
      // - trace continuation
      // -setting the request onto the scope
      addNonEnumerableProperty(event.locals, '_sentrySkipRequestIsolation', true);
      return wrapRequestHandler(
        {
          options: opts,
          request: event.request,
          // @ts-expect-error This will exist in Cloudflare
          context: event.platform.context,
        },
        () => resolve(event),
      );
    }
    return resolve(event);
  };

  return handleInitSentry;
}
