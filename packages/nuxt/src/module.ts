import { type Resolver, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { SentryVueOptions } from './common/types';

export type ModuleOptions = SentryVueOptions;

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@sentry/nuxt',
    configKey: 'sentry',
    compatibility: {
      nuxt: '^3.0.0',
    },
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup(_moduleOptions, _nuxt) {
    // @ts-expect-error - import.meta.url is okay here, but TS is complaining
    const resolver: Resolver = createResolver(import.meta.url);

    if (resolver) {
      addPlugin(resolver.resolve('runtime/plugins/sentry.client.js'));
    }
  },
});
