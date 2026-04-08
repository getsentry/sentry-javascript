import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as initBrowser } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, DEFAULT_ENVIRONMENT, DEV_ENVIRONMENT } from '@sentry/core';
import type { SentryNuxtClientOptions } from '../common/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtClientOptions): Client | undefined {
  const envFallback = import.meta.dev ? DEV_ENVIRONMENT : DEFAULT_ENVIRONMENT;
  const sentryOptions = {
    /* BrowserTracing is added later with the Nuxt client plugin */
    defaultIntegrations: [...getBrowserDefaultIntegrations(options)],
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? envFallback,
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}
