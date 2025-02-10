import * as path from 'path';
import { addPlugin, addPluginTemplate, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import { consoleSandbox } from '@sentry/core';
import type { SentryNuxtModuleOptions } from './common/types';
import { addDynamicImportEntryFileWrapper, addSentryTopImport, addServerConfigToBuild } from './vite/addServerConfig';
import { setupSourceMaps } from './vite/sourceMaps';
import { findDefaultSdkInitFile } from './vite/utils';

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
      if (moduleOptions.autoInjectServerSentry !== 'experimental_dynamic-import') {
        addPluginTemplate({
          mode: 'server',
          filename: 'sentry-server-config.mjs',
          getContents: () =>
            // This won't actually import the server config in the build output (so no double init call). The import here is only needed for correctly resolving the Sentry release injection.
            `import "${buildDirResolver.resolve(`/${serverConfigFile}`)}";
            import { defineNuxtPlugin } from "#imports";
            export default defineNuxtPlugin(() => {});`,
        });
      }

      addServerPlugin(moduleDirResolver.resolve('./runtime/plugins/sentry.server'));
    }

    if (clientConfigFile || serverConfigFile) {
      setupSourceMaps(moduleOptions, nuxt);
    }

    nuxt.hooks.hook('nitro:init', nitro => {
      if (serverConfigFile?.includes('.server.config')) {
        if (nitro.options.dev) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.log(
              '[Sentry] Your application is running in development mode. Note: @sentry/nuxt does not work as expected on the server-side (Nitro). Errors are reported, but tracing does not work.',
            );
          });
        }

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
          addServerConfigToBuild(moduleOptions, nuxt, nitro, serverConfigFile);

          if (moduleOptions.debug) {
            const serverDirResolver = createResolver(nitro.options.output.serverDir);
            const serverConfigPath = serverDirResolver.resolve('sentry.server.config.mjs');

            // For the default nitro node-preset build output this relative path would be: ./.output/server/sentry.server.config.mjs
            const serverConfigRelativePath = `.${path.sep}${path.relative(nitro.options.rootDir, serverConfigPath)}`;

            consoleSandbox(() => {
              // eslint-disable-next-line no-console
              console.log(
                `[Sentry] Using your \`${serverConfigFile}\` file for the server-side Sentry configuration. Make sure to add the Node option \`import\` to the Node command where you deploy and/or run your application. This preloads the Sentry configuration at server startup. You can do this via a command-line flag (\`node --import ${serverConfigRelativePath} [...]\`) or via an environment variable (\`NODE_OPTIONS='--import ${serverConfigRelativePath}' node [...]\`).`,
              );
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
