import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { consoleSandbox } from '@sentry/utils';
import { createSentryPiniaPlugin } from '@sentry/vue';

const INTEGRATION_NAME = 'Pinia';

type Pinia = { use: (plugin: ReturnType<typeof createSentryPiniaPlugin>) => void };

const _piniaIntegration = ((
  // `unknown` here as well because usePinia declares this type: `export declare const usePinia: () => unknown;`
  pinia: unknown | Pinia,
  options: Parameters<typeof createSentryPiniaPlugin>[0] = {},
) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      if (!pinia || (typeof pinia === 'object' && !('use' in pinia))) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            '[Sentry] The Pinia integration was added, but the passed parameter `pinia` has the wrong value. Make sure to enable Pinia by adding `"@pinia/nuxt"` to the Nuxt modules array and pass pinia to Sentry with `piniaIntegration(usePinia())`. Current value of `pinia`:',
            pinia,
          );
        });
      } else {
        (pinia as Pinia).use(createSentryPiniaPlugin(options));
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Monitor an existing Pinia store.
 *
 * This only works if "@pinia/nuxt" is added to the `modules` array.
 */
export const piniaIntegration = defineIntegration(_piniaIntegration);
