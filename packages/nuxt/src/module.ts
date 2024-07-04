import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { SentryNuxtOptions } from './common/types';
import { findDefaultSdkInitFile, injectSentryConfigImport } from './common/utils';

export type ModuleOptions = SentryNuxtOptions;

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@sentry/nuxt/module',
    configKey: 'sentry',
    compatibility: {
      nuxt: '^3.0.0',
    },
  },
  defaults: {},
  setup(_moduleOptions, nuxt) {
    const moduleDirResolver = createResolver(import.meta.url);
    const buildDirResolver = createResolver(nuxt.options.buildDir);

    const clientConfigFile = findDefaultSdkInitFile('client');

    if (clientConfigFile) {
      nuxt.options.alias['#sentry-client-config'] = buildDirResolver.resolve(`/${clientConfigFile}`);

      injectSentryConfigImport('#sentry-client-config');

      addPlugin(moduleDirResolver.resolve('./runtime/plugins/sentry.client'));
    }

    const serverConfigFile = findDefaultSdkInitFile('server');

    if (serverConfigFile) {
      nuxt.options.alias['#sentry-server-config'] = buildDirResolver.resolve(`/${serverConfigFile}`);

      injectSentryConfigImport('#sentry-server-config');
    }
  },
});
