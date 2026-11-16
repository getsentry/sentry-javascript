import type { CloudflareClient, CloudflareOptions } from '@sentry/cloudflare';
import {
  _INTERNAL_getFinalOptions as getFinalOptions,
  _INTERNAL_init as initCloudflareSdk,
  setAsyncLocalStorageAsyncContextStrategy,
} from '@sentry/cloudflare';
import { applySdkMetadata } from '@sentry/core';

let getBindings: (() => unknown) | undefined;

/**
 * Sets where `init` reads the Worker's bindings from. Only the `workerd` entry can import them.
 */
export function setBindingsGetter(getter: (() => unknown) | undefined): void {
  getBindings = getter;
}

/**
 * Initializes the Sentry Astro SDK on Cloudflare Workers and Pages.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  // `withSentry` fills unset options from the bindings it gets per request. This init can run first, and the
  // isolate keeps the first client, so it reads the same bindings to end up with the same options.
  const opts = getFinalOptions({ ...options }, getBindings?.());

  applySdkMetadata(opts, 'astro', ['astro', 'cloudflare']);

  // Pages has no `withSentry` wrap to install this, and the middleware's per-request isolation scopes depend on it.
  setAsyncLocalStorageAsyncContextStrategy();

  return initCloudflareSdk(opts);
}
