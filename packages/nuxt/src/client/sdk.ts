import { init as initBrowser } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';
import type { Client } from '@sentry/types';
import type { SentryNuxtOptions } from '../common/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtOptions): Client | undefined {
  const sentryOptions = {
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}
