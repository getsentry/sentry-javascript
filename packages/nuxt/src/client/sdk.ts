import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowser } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';
import type { Client } from '@sentry/core';
import type { SentryNuxtClientOptions } from '../common/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtClientOptions): Client | undefined {
  console.log(options)
  console.log(import.meta.dev)

  const sentryOptions = {
    /* BrowserTracing is added later with the Nuxt client plugin */
    defaultIntegrations: [...getBrowserDefaultIntegrations(options)],
    environment: import.meta.dev ? 'development' : 'production',
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}
