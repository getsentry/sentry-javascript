import * as fs from 'fs';
import * as path from 'path';
import { addPlugin, addPluginTemplate, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { SentryNuxtModuleOptions } from '../common/types';
import { setupSourceMaps } from '../vite/sourceMaps';

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
        getContents: () =>
          `import "${buildDirResolver.resolve(`/${clientConfigFile}`)}"\n` +
          'export default defineNuxtPlugin(() => {})',
      });

      addPlugin({ src: moduleDirResolver.resolve('./plugins/sentry.client'), mode: 'client' });
    }

    const serverConfigFile = findDefaultSdkInitFile('server');

    if (serverConfigFile) {
      // Inject the server-side Sentry config file with a side effect import
      addPluginTemplate({
        mode: 'server',
        filename: 'sentry-server-config.mjs',
        getContents: () =>
          `import "${buildDirResolver.resolve(`/${serverConfigFile}`)}"\n` +
          'export default defineNuxtPlugin(() => {})',
      });

      addServerPlugin(moduleDirResolver.resolve('./plugins/sentry.server'));
    }

    if (clientConfigFile || serverConfigFile) {
      setupSourceMaps(moduleOptions, nuxt);
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
