import { getDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { vueIntegration } from './integration';
import type { Options } from './types';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const opts = {
    defaultIntegrations: [...getDefaultIntegrations(options), vueIntegration()],
    ...options,
  };

  applySdkMetadata(opts, 'vue');

  return browserInit(opts);
}
