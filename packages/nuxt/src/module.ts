import { addPlugin, addPluginTemplate, addTemplate, addVitePlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
// Needed to make TS evaluate the augmentation of Nitro types (https://github.com/nuxt/nuxt/pull/34039)
import type {} from '@nuxt/nitro-server';

import * as path from 'path';
import type { SentryNuxtModuleOptions } from './common/types';
import { setupNitroServer } from './vite/nitroServer';
import { setupOrchestrion } from './vite/orchestrion';
import { setupSourceMaps } from './vite/sourceMaps';
import { findDefaultSdkInitFile, resolveServerApi } from './vite/utils';

export type ModuleOptions = SentryNuxtModuleOptions;
type NuxtPageSubset = { file?: string; path: string };

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@sentry/nuxt/module',
    configKey: 'sentry',
    compatibility: {
      nuxt: '>=3.7.0',
    },
  },
  defaults: {},
  async setup(moduleOptionsParam, nuxt) {
    if (moduleOptionsParam?.enabled === false) {
      return;
    }

    const serverApi = resolveServerApi();

    const moduleOptions = {
      ...moduleOptionsParam,
      // oxlint-disable-next-line typescript/no-deprecated -- supported until removal
      autoInjectServerSentry: moduleOptionsParam.autoInjectServerSentry,
      // oxlint-disable-next-line typescript/no-deprecated -- supported until removal
      experimental_entrypointWrappedFunctions: moduleOptionsParam.experimental_entrypointWrappedFunctions || [
        'default',
        'handler',
        'server',
      ],
    };

    const moduleDirResolver = createResolver(import.meta.url);
    const buildDirResolver = createResolver(nuxt.options.buildDir);

    const clientConfigFile = await findDefaultSdkInitFile('client', nuxt, moduleOptions);

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
    }

    const serverConfigFile = await findDefaultSdkInitFile('server', nuxt, moduleOptions);
    const nuxtMajor = parseInt((nuxt as unknown as { _version: string })._version?.split('.')[0] ?? '3', 10);
    const isMinNuxtV4 = nuxtMajor >= 4;

    // Orchestrion runs on both the Node path (gated on a server config file) and the Cloudflare path
    // (which has no server config file — the SDK is set up via `sentryCloudflareNitroPlugin`). The
    // Cloudflare detection happens inside, keyed off the resolved Nitro preset.
    setupOrchestrion(nuxt, !!serverConfigFile, moduleOptions.buildTimeInstrumentation);

    if (serverConfigFile) {
      setupNitroServer(nuxt, serverApi, serverConfigFile, moduleOptions);

      if (isMinNuxtV4) {
        addPlugin({ src: moduleDirResolver.resolve('./runtime/plugins/route-detector.server'), mode: 'server' });
      } else {
        addPlugin({ src: moduleDirResolver.resolve('./runtime/plugins/route-detector-legacy.server'), mode: 'server' });
      }
    }

    if (clientConfigFile || serverConfigFile) {
      setupSourceMaps(moduleOptions, nuxt, addVitePlugin);
    }

    let pagesData: NuxtPageSubset[] = [];

    nuxt.hooks.hook('pages:extend', pages => {
      pagesData = pages
        .map(page => ({ file: page.file, path: page.path }))
        .filter(page => {
          // Check for dynamic parameter (e.g., :userId or [userId])
          return page.path.includes(':') || page?.file?.includes('[');
        });
    });

    if (isMinNuxtV4) {
      const pagesDataVirtualModuleId = '#sentry/nuxt-pages-data.mjs';

      // Vite virtual plugin (for the Vite SSR build, where addPlugin mode:'server' plugins are bundled)
      addVitePlugin({
        name: 'sentry-nuxt-pages-data-virtual',
        resolveId: (id: string) => (id === pagesDataVirtualModuleId ? `\0${pagesDataVirtualModuleId}` : null),
        load: (id: string) =>
          id === `\0${pagesDataVirtualModuleId}` ? `export default ${JSON.stringify(pagesData, null, 2)};` : undefined,
      });
    } else {
      // Nuxt v3: register as a build template (accessible via #build/)
      addTemplate({
        filename: 'sentry--nuxt-pages-data.mjs',
        getContents: () => `export default ${JSON.stringify(pagesData, null, 2)};`,
      });
    }

    // Add the sentry config file to the include array
    nuxt.hook('prepare:types', options => {
      const tsConfig = options.tsConfig as { include?: string[] };

      if (!tsConfig.include) {
        tsConfig.include = [];
      }

      // Add type references for useRuntimeConfig in root files for nuxt v4
      // Should be relative to `root/.nuxt`
      if (clientConfigFile) {
        const relativePath = path.relative(nuxt.options.buildDir, clientConfigFile);
        tsConfig.include.push(relativePath);
      }
      if (serverConfigFile) {
        const relativePath = path.relative(nuxt.options.buildDir, serverConfigFile);
        tsConfig.include.push(relativePath);
      }
    });
  },
});
