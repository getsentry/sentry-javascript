import {
  type CloudflareOptions,
  getDefaultIntegrations as getDefaultCloudflareIntegrations,
  setAsyncLocalStorageAsyncContextStrategy,
  wrapRequestHandler,
} from '@sentry/cloudflare';
import { addNonEnumerableProperty } from '@sentry/core';
import type { Handle, MaybePromise } from '@sveltejs/kit';
import { rewriteFramesIntegration } from '../server-common/rewriteFramesIntegration';

/**
 *  Initializes Sentry SvelteKit Cloudflare SDK
 *  This should be before the sentryHandle() call.
 *
 *  In the Node export, this is a stub that does nothing.
 */
export function initCloudflareSentryHandle(options: CloudflareOptions): Handle {
  const opts: CloudflareOptions = {
    defaultIntegrations: [...getDefaultCloudflareIntegrations(options), rewriteFramesIntegration()],
    ...options,
  };

  setAsyncLocalStorageAsyncContextStrategy();

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
          // @ts-expect-error This expects a cloudflare request, but we cannot type
          // it in the sveltekit worker.
          request: event.request,
          // @ts-expect-error This will exist in Cloudflare
          context: event.platform.context,
        },
        () => resolve(event),
        // We need to cast this because `wrapRequestHandler` returns a Cloudflare Response,
        // which is not compatible with the regular Response type.
      ) as unknown as MaybePromise<Response>;
    }
    return resolve(event);
  };

  return handleInitSentry;
}
