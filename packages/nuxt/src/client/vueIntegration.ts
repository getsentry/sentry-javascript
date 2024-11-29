import { GLOBAL_OBJ, defineIntegration } from '@sentry/core';
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

// Since the options object needs to cross the boundary between some builds (i.e. the nuxt module build and our client
// SDK build) we cannot use a getter that is exported from here. Instead we'll pass the options object through a global
// to the module.
export type GlobalObjWithIntegrationOptions = { _sentryNuxtVueIntegrationOptions?: Options };

// The vue integration is actually set up in the Sentry Client Module. There it is set up as soon as the nuxt app object is available.
// However, we need to export the vueIntegration from the Client SDK. This means all this integration does is store away
// its options for the Sentry Client Module to pick them up when initializing the actual vueIntegration.

/**
 * Add additional error and span instrumentation specialized for Vue.
 */
export const vueIntegration = defineIntegration((options: Options = {}) => {
  (GLOBAL_OBJ as GlobalObjWithIntegrationOptions)._sentryNuxtVueIntegrationOptions = options;
  return {
    name: 'NuxtVueIntegration',
  };
});
