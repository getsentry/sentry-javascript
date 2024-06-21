import { applySdkMetadata } from '@sentry/core';
import type { Client } from '@sentry/types';
import { init as initVue } from '@sentry/vue';
import type { SentryVueOptions } from '../common/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryVueOptions): Client | undefined {
  const sentryOptions = {
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initVue(sentryOptions);
}
