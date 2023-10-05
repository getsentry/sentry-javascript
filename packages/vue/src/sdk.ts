import { defaultIntegrations, init as browserInit, SDK_VERSION } from '@sentry/browser';

import { VueIntegration } from './integration';
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
    defaultIntegrations: [...defaultIntegrations, new VueIntegration()],
    ...config,
  };

  browserInit(options);
}
