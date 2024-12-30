import { SDK_VERSION, getDefaultIntegrations, init as browserInit } from '@sentry/browser';

import type { Client } from '@sentry/core';
import { vueIntegration } from './integration';
import type { Options } from './types';

/**
 * Inits the Vue SDK
 */
export function init(config: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const options = {
    _metadata: {
      sdk: {
        name: 'sentry.javascript.vue',
        packages: [
          {
            name: 'npm:@sentry/vue',
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      },
    },
    defaultIntegrations: [...getDefaultIntegrations(config), vueIntegration()],
    ...config,
  };

  return browserInit(options);
}
