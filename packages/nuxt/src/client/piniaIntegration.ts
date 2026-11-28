import type { IntegrationFn } from '@sentry/core';
import { consoleSandbox, defineIntegration } from '@sentry/core';
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

const definedPiniaIntegration = defineIntegration(_piniaIntegration);

/**
 * Monitor an existing Pinia store.
 *
 * This only works if "@pinia/nuxt" is added to the `modules` array.
 */
export const piniaIntegration: typeof definedPiniaIntegration = (pinia, options = {}) => {
  const integration = definedPiniaIntegration(pinia, options);
  // The first argument is the Pinia instance, so `defineIntegration` records that instead of the options.
  integration._options = options;

  return integration;
};
