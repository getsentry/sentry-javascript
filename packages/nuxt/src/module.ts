import { addPlugin, addPluginTemplate, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit';
import { setupSentryNitroModule } from '@sentry/nitro';
import * as path from 'path';
import type { SentryNuxtModuleOptions } from './common/types';
import { setupSourceMaps } from './vite/sourceMaps';
import { addOTelCommonJSImportAlias, findDefaultSdkInitFile } from './vite/utils';

export type ModuleOptions = SentryNuxtModuleOptions;

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@sentry/nuxt/module',
    configKey: 'sentry',
    compatibility: {
      nuxt: '>=3.7.0',
    },
  },
  defaults: {},
  setup(moduleOptions, nuxt) {
    if (moduleOptions?.enabled === false) {
      return;
    }

    const serverConfigFile = findDefaultSdkInitFile('server', nuxt);
    const clientConfigFile = findDefaultSdkInitFile('client', nuxt);

    const moduleDirResolver = createResolver(import.meta.url);
    const buildDirResolver = createResolver(nuxt.options.buildDir);

    if (clientConfigFile) {
      // Inject the client-side Sentry config file with a side effect import
      addPluginTemplate({
        mode: 'client',
        filename: 'sentry-client-config.mjs',
        order: 0,

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

      // Add the plugin which loads client integrations etc. -
      // this must run after the sentry-client-config plugin has run, and the client is initialized!
      addPlugin({
        src: moduleDirResolver.resolve('./runtime/plugins/sentry.client'),
        mode: 'client',
        order: 1,
      });

      // Add the sentry config file to the include array
      nuxt.hook('prepare:types', options => {
        const tsConfig = options.tsConfig as { include?: string[] };

        if (!tsConfig.include) {
          tsConfig.include = [];
        }

        // Add type references for useRuntimeConfig in root files for nuxt v4
        // Should be relative to `root/.nuxt`
        const relativePath = path.relative(nuxt.options.buildDir, clientConfigFile);
        tsConfig.include.push(relativePath);
      });
    }

    if (serverConfigFile) {
      // Add the Nitro module to the Nitro config
      setupSentryNitroModule(nuxt.options.nitro, moduleOptions, serverConfigFile);

      addPlugin({
        src: moduleDirResolver.resolve('./runtime/plugins/route-detector.server'),
        mode: 'server',
      });
    }

    if (clientConfigFile || serverConfigFile) {
      setupSourceMaps(moduleOptions, nuxt);
    }

    addOTelCommonJSImportAlias(nuxt);

    const pagesDataTemplate = addTemplate({
      filename: 'sentry--nuxt-pages-data.mjs',
      // Initial empty array (later filled in pages:extend hook)
      // Template needs to be created in the root-level of the module to work
      getContents: () => 'export default [];',
    });

    nuxt.hooks.hook('pages:extend', pages => {
      pagesDataTemplate.getContents = () => {
        const pagesSubset = pages
          .map(page => ({ file: page.file, path: page.path }))
          .filter(page => {
            // Check for dynamic parameter (e.g., :userId or [userId])
            return page.path.includes(':') || page?.file?.includes('[');
          });

        return `export default ${JSON.stringify(pagesSubset, null, 2)};`;
      };
    });
  },
});
