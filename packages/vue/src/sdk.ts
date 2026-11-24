import { getDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata, setNormalizeStringifier } from '@sentry/core';

import { vueIntegration } from './integration';
import type { Options } from './types';
import { normalizeStringifyValue } from './normalizeStringifyValue';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const opts = {
    defaultIntegrations: [...getDefaultIntegrations(options), vueIntegration()],
    ..._INTERNAL_captureOptionsSetByUser(options),
  };

  applySdkMetadata(opts, 'vue');

  const client = browserInit(opts);

  // Add vue-specific stringification
  setNormalizeStringifier(normalizeStringifyValue);

  return client;
}
