import * as path from 'node:path';
import { consoleSandbox } from '@sentry/core';
import type { Nitro } from 'nitropack/types';
import type { SentryNitroModuleOptionsWithDefaults } from '../common/types';
import { addPlugin, createResolver } from '../utils';
import { addDynamicImportEntryFileWrapper, addSentryTopImport, addServerConfigToBuild } from './setupServer';

/**
 * Sets up the entrypoint instrumentation for the Nitro server.
 */
export function setupEntrypointInstrumentation(
  nitro: Nitro,
  serverConfigFile: string,
  moduleOptions: SentryNitroModuleOptionsWithDefaults,
): void {
  if (!serverConfigFile?.includes('.server.config')) {
    return;
  }

  const moduleResolver = createResolver(import.meta.url);
  addPlugin(nitro, moduleResolver.resolve('../runtime/plugins/sentry.server'));

  consoleSandbox(() => {
    const serverDir = nitro.options.output.serverDir;

    // Netlify env: https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    if (serverDir.includes('.netlify') || !!process.env.NETLIFY) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Warning: The Sentry SDK detected a Netlify build. Server-side support for the Sentry Nitro SDK on Netlify is currently unreliable due to technical limitations of serverless functions. Traces are not collected, and errors may occasionally not be reported. For more information on setting up Sentry on the Nitro server-side, please refer to the documentation: https://docs.sentry.io/platforms/javascript/guides/nuxt/install/',
      );
    }

    // Vercel env: https://vercel.com/docs/projects/environment-variables/system-environment-variables#VERCEL
    if (serverDir.includes('.vercel') || !!process.env.VERCEL) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Warning: The Sentry SDK detected a Vercel build. The Sentry Nitro SDK currently does not support tracing on Vercel. For more information on setting up Sentry on the Nitro server-side, please refer to the documentation: https://docs.sentry.io/platforms/javascript/guides/nuxt/install/',
      );
    }
  });

  if (moduleOptions.autoInjectServerSentry !== 'experimental_dynamic-import') {
    addServerConfigToBuild(nitro, serverConfigFile, moduleOptions);

    if (moduleOptions.debug) {
      const serverDirResolver = createResolver(nitro.options.output.serverDir);
      const serverConfigPath = serverDirResolver.resolve('sentry.server.config.mjs');

      // For the default nitro node-preset build output this relative path would be: ./.output/server/sentry.server.config.mjs
      const serverConfigRelativePath = `.${path.sep}${path.relative(nitro.options.rootDir, serverConfigPath)}`;

      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry] Using \`${serverConfigFile}\` for server-side Sentry configuration. To activate Sentry on the Nitro server-side, this file must be preloaded when starting your application. Make sure to add this where you deploy and/or run your application. Read more here: https://docs.sentry.io/platforms/javascript/guides/nuxt/install/.`,
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
