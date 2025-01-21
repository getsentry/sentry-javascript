import { type CloudflareOptions, wrapRequestHandler } from '@sentry/cloudflare';
import { getDefaultIntegrations as getDefaultCloudflareIntegrations } from '@sentry/cloudflare';
import type { Handle } from '@sveltejs/kit';

import { rewriteFramesIntegration } from '../server-common/rewriteFramesIntegration';

/** Initializes Sentry SvelteKit Cloudflare SDK
 *  This should be before the sentryHandle() call.
 *
 *  In Node.js, this is a stub that does nothing.
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
