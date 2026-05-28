import { getDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, setNormalizeStringifier } from '@sentry/core/browser';

import { vueIntegration } from './integration';
import type { Options } from './types';
import { normalizeStringifyValue } from './normalizeStringifyValue';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const opts = {
    defaultIntegrations: [...getDefaultIntegrations(options), vueIntegration()],
    ...options,
  };

  applySdkMetadata(opts, 'vue');

  const client = browserInit(opts);

  // Add vue-specific stringification
  setNormalizeStringifier(normalizeStringifyValue);

  return client;
}
