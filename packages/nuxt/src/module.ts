import { addPlugin, addPluginTemplate, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { SentryNuxtModuleOptions } from './common/types';
import { addServerConfigToBuild } from './vite/addServerConfig';
import { setupSourceMaps } from './vite/sourceMaps';
import { findDefaultSdkInitFile } from './vite/utils';

export type ModuleOptions = SentryNuxtModuleOptions;

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@sentry/nuxt/module',
    configKey: 'sentry',
    compatibility: {
      nuxt: '^3.0.0',
    },
  },
  defaults: {},
  setup(moduleOptions, nuxt) {
    const moduleDirResolver = createResolver(import.meta.url);
    const buildDirResolver = createResolver(nuxt.options.buildDir);

    const clientConfigFile = findDefaultSdkInitFile('client');

    if (clientConfigFile) {
      // Inject the client-side Sentry config file with a side effect import
      addPluginTemplate({
        mode: 'client',
        filename: 'sentry-client-config.mjs',

        // Dynamic import of config file to wrap it within a Nuxt context (here: defineNuxtPlugin)
        // Makes it possible to call useRuntimeConfig() in the user-defined sentry config file
        getContents: () => `
          import { defineNuxtPlugin } from "#imports";

          export default defineNuxtPlugin({
            name: 'sentry-client-config',
            async setup() {
              await import("${buildDirResolver.resolve(`/${clientConfigFile}`)}")
            }
          });`,
      });

      addPlugin({ src: moduleDirResolver.resolve('./runtime/plugins/sentry.client'), mode: 'client' });
    }

    const serverConfigFile = findDefaultSdkInitFile('server');

    if (serverConfigFile) {
      // Inject the server-side Sentry config file with a side effect import
      addPluginTemplate({
        mode: 'server',
        filename: 'sentry-server-config.mjs',
        getContents: () =>
          `import "${buildDirResolver.resolve(`/${serverConfigFile}`)}"\n` +
          'import { defineNuxtPlugin } from "#imports"\n' +
          'export default defineNuxtPlugin(() => {})',
      });

      addServerPlugin(moduleDirResolver.resolve('./runtime/plugins/sentry.server'));
    }

    if (clientConfigFile || serverConfigFile) {
      setupSourceMaps(moduleOptions, nuxt);
    }
    if (serverConfigFile && serverConfigFile.includes('.server.config')) {
      if (moduleOptions.debug) {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry] Using your ${serverConfigFile} file for the server-side Sentry configuration. In case you have a \`public/instrument.server\` file, the \`public/instrument.server\` file will be ignored. Make sure the file path in your node \`--import\` option matches your Sentry server config file.`,
        );
      }

      addServerConfigToBuild(moduleOptions, nuxt, serverConfigFile);
    }
  },
});
