import * as fs from 'fs';
import * as path from 'path';
import { addPlugin, addPluginTemplate, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { SentryNuxtModuleOptions } from './common/types';
import { addServerConfig } from './vite/addServerConfig';
import { setupSourceMaps } from './vite/sourceMaps';

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
    if (serverConfigFile) {
      addServerConfig(moduleOptions, nuxt, serverConfigFile);
    }
  },
});

function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];

  const cwd = process.cwd();
  const filePath = possibleFileExtensions
    .map(e =>
      path.resolve(
        type === 'server'
          ? path.join(cwd, 'public', `instrument.${type}.${e}`)
          : path.join(cwd, `sentry.${type}.config.${e}`),
      ),
    )
    .find(filename => fs.existsSync(filename));

  return filePath ? path.basename(filePath) : undefined;
}
