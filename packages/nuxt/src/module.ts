import {
  addPlugin,
  addPluginTemplate,
  addServerPlugin,
  addTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit';
import { consoleSandbox } from '@sentry/core';
import * as path from 'path';
import type { SentryNuxtModuleOptions } from './common/types';
import { addDynamicImportEntryFileWrapper, addSentryTopImport, addServerConfigToBuild } from './vite/addServerConfig';
import { addDatabaseInstrumentation } from './vite/databaseConfig';
import { addMiddlewareImports, addMiddlewareInstrumentation } from './vite/middlewareConfig';
import { setupSourceMaps } from './vite/sourceMaps';
import { addStorageInstrumentation } from './vite/storageConfig';
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
  setup(moduleOptionsParam, nuxt) {
    if (moduleOptionsParam?.enabled === false) {
      return;
    }

    const moduleOptions = {
      ...moduleOptionsParam,
      autoInjectServerSentry: moduleOptionsParam.autoInjectServerSentry,
      experimental_entrypointWrappedFunctions: moduleOptionsParam.experimental_entrypointWrappedFunctions || [
        'default',
        'handler',
        'server',
      ],
    };

    const moduleDirResolver = createResolver(import.meta.url);
    const buildDirResolver = createResolver(nuxt.options.buildDir);

    const clientConfigFile = findDefaultSdkInitFile('client', nuxt);

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

    const serverConfigFile = findDefaultSdkInitFile('server', nuxt);

    if (serverConfigFile) {
      addServerPlugin(moduleDirResolver.resolve('./runtime/plugins/sentry.server'));

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

    // Preps the the middleware instrumentation module.
    if (serverConfigFile) {
      addMiddlewareImports();
      addStorageInstrumentation(nuxt);
      addDatabaseInstrumentation(nuxt.options.nitro, moduleOptions);
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

    nuxt.hooks.hook('nitro:init', nitro => {
      if (nuxt.options?._prepare) {
        return;
      }

      if (serverConfigFile) {
        addMiddlewareInstrumentation(nitro);
      }

      if (serverConfigFile?.includes('.server.config')) {
        consoleSandbox(() => {
          const serverDir = nitro.options.output.serverDir;

          // Netlify env: https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
          if (serverDir.includes('.netlify') || !!process.env.NETLIFY) {
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] Warning: The Sentry SDK detected a Netlify build. Server-side support for the Sentry Nuxt SDK on Netlify is currently unreliable due to technical limitations of serverless functions. Traces are not collected, and errors may occasionally not be reported. For more information on setting up Sentry on the Nuxt server-side, please refer to the documentation: https://docs.sentry.io/platforms/javascript/guides/nuxt/install/',
            );
          }

          // Vercel env: https://vercel.com/docs/projects/environment-variables/system-environment-variables#VERCEL
          if (serverDir.includes('.vercel') || !!process.env.VERCEL) {
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] Warning: The Sentry SDK detected a Vercel build. The Sentry Nuxt SDK currently does not support tracing on Vercel. For more information on setting up Sentry on the Nuxt server-side, please refer to the documentation: https://docs.sentry.io/platforms/javascript/guides/nuxt/install/',
            );
          }
        });

        if (moduleOptions.autoInjectServerSentry !== 'experimental_dynamic-import') {
          addServerConfigToBuild(moduleOptions, nitro, serverConfigFile);

          if (moduleOptions.debug) {
            const serverDirResolver = createResolver(nitro.options.output.serverDir);
            const serverConfigPath = serverDirResolver.resolve('sentry.server.config.mjs');

            // For the default nitro node-preset build output this relative path would be: ./.output/server/sentry.server.config.mjs
            const serverConfigRelativePath = `.${path.sep}${path.relative(nitro.options.rootDir, serverConfigPath)}`;

            consoleSandbox(() => {
              // eslint-disable-next-line no-console
              console.log(
                `[Sentry] Using \`${serverConfigFile}\` for server-side Sentry configuration. To activate Sentry on the Nuxt server-side, this file must be preloaded when starting your application. Make sure to add this where you deploy and/or run your application. Read more here: https://docs.sentry.io/platforms/javascript/guides/nuxt/install/.`,
              );

              if (nitro.options.dev) {
                // eslint-disable-next-line no-console
                console.log(
                  `[Sentry] During development, preload Sentry with the NODE_OPTIONS environment variable: \`NODE_OPTIONS='--import ${serverConfigRelativePath}' nuxt dev\`. The file is generated in the build directory (usually '.nuxt'). If you delete the build directory, run \`nuxt dev\` to regenerate it.`,
                );
              } else {
                // eslint-disable-next-line no-console
                console.log(
                  `[Sentry] When running your built application, preload Sentry via a command-line flag (\`node --import ${serverConfigRelativePath} [...]\`) or via an environment variable (\`NODE_OPTIONS='--import ${serverConfigRelativePath}' node [...]\`).`,
                );
              }
            });
          }
        }

        if (moduleOptions.autoInjectServerSentry === 'top-level-import') {
          addSentryTopImport(moduleOptions, nitro);
        }

        if (moduleOptions.autoInjectServerSentry === 'experimental_dynamic-import') {
          addDynamicImportEntryFileWrapper(nitro, serverConfigFile, moduleOptions);

          if (moduleOptions.debug) {
            consoleSandbox(() => {
              // eslint-disable-next-line no-console
              console.log(
                '[Sentry] Wrapping the server entry file with a dynamic `import()`, so Sentry can be preloaded before the server initializes.',
              );
            });
          }
        }
      }
    });
  },
});
