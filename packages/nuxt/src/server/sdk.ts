import { applySdkMetadata } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { Client } from '@sentry/types';
import type { SentryNuxtOptions } from '../common/types';

/**
 * Initializes the server-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtOptions): Client | undefined {
  const sentryOptions = {
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'node']);

  return initNode(sentryOptions);
}
