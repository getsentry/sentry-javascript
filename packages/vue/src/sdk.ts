import { SDK_VERSION, init as browserInit, getDefaultIntegrations } from '@sentry/browser';

import { vueIntegration } from './integration';
import type { Options, TracingOptions } from './types';

/**
 * Inits the Vue SDK
 */
export function init(
  config: Partial<Omit<Options, 'tracingOptions'> & { tracingOptions: Partial<TracingOptions> }> = {},
): void {
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

  browserInit(options);
}
