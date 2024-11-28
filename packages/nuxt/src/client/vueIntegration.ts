import { defineIntegration } from '@sentry/core';
import type { VueIntegrationOptions } from '@sentry/vue';

type Options = Omit<
  VueIntegrationOptions,
  | 'app'
  | 'Vue'
  // TODO(v9): Should be removed from parent type so we can remove it here
  | 'hooks'
  // TODO(v9): Should be removed from parent type so we can remove it here
  | 'timeout'
  // TODO(v9): Should be removed from parent type so we can remove it here
  | 'trackComponents'
>;

let nuxtVueIntegrationOptions: Options | undefined;

export const vueIntegration = defineIntegration((options: Options = {}) => {
  nuxtVueIntegrationOptions = options;
  return {
    name: 'NuxtVueIntegration',
  };
});

/**
 * The vueIntegration exported by the Nuxt SDK does nothing besides storing it's options to the side so we can later pick them up when we add the actual vueIntegration.
 * This function allows us to pick up the options.
 */
export function retrieveNuxtVueIntegrationOptions(): Options | undefined {
  return nuxtVueIntegrationOptions;
}
