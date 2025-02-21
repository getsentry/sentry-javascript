import type { CloudflareOptions } from '@sentry/cloudflare';
import type { Handle } from '@sveltejs/kit';
import { init } from './sdk';

/**
 * Actual implementation in ../worker/handle.ts
 *
 * This handler initializes the Sentry Node(!) SDK with the passed options. This is necessary to get
 * the SDK configured for cloudflare working in dev mode.
 *
 * @return version of initCLoudflareSentryHandle that is called via node/server entry point
 */
export function initCloudflareSentryHandle(options: CloudflareOptions): Handle {
  let sentryInitialized = false;

  return ({ event, resolve }) => {
    if (!sentryInitialized) {
      sentryInitialized = true;
      init(options);
    }

    return resolve(event);
  };
}
