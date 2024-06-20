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
    // Ignore because of `import.meta.url`
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const resolver: Resolver = createResolver(import.meta.url);

    if (resolver) {
      // Ignore because `.resolve` is a valid method of `Resolver`, but because of ts-ignore above, `Resolver` is recognized as any
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      addPlugin(resolver.resolve('runtime/plugins/sentry.client.js'));
    }
  },
});
