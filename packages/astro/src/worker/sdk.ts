import type { CloudflareClient, CloudflareOptions } from '@sentry/cloudflare';
import { _INTERNAL_init as initCloudflareSdk, setAsyncLocalStorageAsyncContextStrategy } from '@sentry/cloudflare';
import { applySdkMetadata } from '@sentry/core';

/**
 * Initializes the Sentry Astro SDK on Cloudflare Workers and Pages.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'astro', ['astro', 'cloudflare']);

  // Pages has no `withSentry` wrap to install this, and the middleware's per-request isolation scopes depend on it.
  setAsyncLocalStorageAsyncContextStrategy();

  return initCloudflareSdk(opts);
}
