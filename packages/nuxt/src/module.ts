import * as path from 'path';
import { addPlugin, addPluginTemplate, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import { consoleSandbox } from '@sentry/utils';
import type { SentryNuxtModuleOptions } from './common/types';
import { addSentryTopImport, addServerConfigToBuild } from './vite/addServerConfig';
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

    nuxt.hooks.hook('nitro:init', nitro => {
      if (serverConfigFile && serverConfigFile.includes('.server.config')) {
        addServerConfigToBuild(moduleOptions, nuxt, nitro, serverConfigFile);

        consoleSandbox(() => {
          const serverDir = nitro.options.output.serverDir;

          if (serverDir.includes('.netlify')) {
            // eslint-disable-next-line no-console
            console.warn(
              '[Sentry] Warning: The Sentry SDK discovered a Netlify build. The server-side Sentry support with ESM is experimental and may not work as expected. Please check out the docs for how to use Sentry on different deployment providers: https://docs.sentry.io/platforms/javascript/guides/nuxt/deployment-provider-setup/',
            );
          }
        });

        if (moduleOptions.experimental_basicServerTracing) {
          addSentryTopImport(moduleOptions, nitro);
        } else {
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
      }
    });
  },
});
