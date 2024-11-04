import * as fs from 'fs';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { wrapServerEntryWithDynamicImport } from '@sentry-internal/nitro-utils';
import { consoleSandbox } from '@sentry/core';
import type { Nitro } from 'nitropack';
import type { SentryNuxtModuleOptions } from '../common/types';

const SERVER_CONFIG_FILENAME = 'sentry.server.config';

/**
 *  Adds the `sentry.server.config.ts` file as `sentry.server.config.mjs` to the `.output` directory to be able to reference this file in the node --import option.
 *
 *  1. Adding the file as a rollup import, so it is included in the build (automatically transpiles the file).
 *  2. Copying the file to the `.output` directory after the build process is finished.
 */
export function addServerConfigToBuild(
  moduleOptions: SentryNuxtModuleOptions,
  nuxt: Nuxt,
  nitro: Nitro,
  serverConfigFile: string,
): void {
  nuxt.hook('vite:extendConfig', async (viteInlineConfig, _env) => {
    if (
      typeof viteInlineConfig?.build?.rollupOptions?.input === 'object' &&
      'server' in viteInlineConfig.build.rollupOptions.input
    ) {
      // Create a rollup entry for the server config to add it as `sentry.server.config.mjs` to the build
      (viteInlineConfig.build.rollupOptions.input as { [entryName: string]: string })[SERVER_CONFIG_FILENAME] =
        createResolver(nuxt.options.srcDir).resolve(`/${serverConfigFile}`);
    }

    /**
     * When the build process is finished, copy the `sentry.server.config` file to the `.output` directory.
     * This is necessary because we need to reference this file path in the node --import option.
     */
    nitro.hooks.hook('close', async () => {
      const buildDirResolver = createResolver(nitro.options.buildDir);
      const serverDirResolver = createResolver(nitro.options.output.serverDir);
      const source = buildDirResolver.resolve(`dist/server/${SERVER_CONFIG_FILENAME}.mjs`);
      const destination = serverDirResolver.resolve(`${SERVER_CONFIG_FILENAME}.mjs`);

      try {
        await fs.promises.access(source, fs.constants.F_OK);
        await fs.promises.copyFile(source, destination);

        if (moduleOptions.debug) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.log(
              `[Sentry] Successfully added the content of the \`${serverConfigFile}\` file to \`${destination}\``,
            );
          });
        }
      } catch (error) {
        if (moduleOptions.debug) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.warn(
              `[Sentry] An error occurred when trying to add the \`${serverConfigFile}\` file to the \`.output\` directory`,
              error,
            );
          });
        }
      }
    });
  });
}

/**
 * This function modifies the Rollup configuration to include a plugin that wraps the entry file with a dynamic import (`import()`)
 * and adds the Sentry server config with the static `import` declaration.
 *
 * With this, the Sentry server config can be loaded before all other modules of the application (which is needed for import-in-the-middle).
 * See: https://nodejs.org/api/module.html#enabling
 */
export function addDynamicImportEntryFileWrapper(
  nitro: Nitro,
  serverConfigFile: string,
  moduleOptions: Omit<SentryNuxtModuleOptions, 'entrypointWrappedFunctions'> &
    Required<Pick<SentryNuxtModuleOptions, 'entrypointWrappedFunctions'>>,
): void {
  if (!nitro.options.rollupConfig) {
    nitro.options.rollupConfig = { output: {} };
  }

  if (nitro.options.rollupConfig?.plugins === null || nitro.options.rollupConfig?.plugins === undefined) {
    nitro.options.rollupConfig.plugins = [];
  } else if (!Array.isArray(nitro.options.rollupConfig.plugins)) {
    // `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
    nitro.options.rollupConfig.plugins = [nitro.options.rollupConfig.plugins];
  }

  nitro.options.rollupConfig.plugins.push(
    wrapServerEntryWithDynamicImport({
      serverConfigFileName: SERVER_CONFIG_FILENAME,
      resolvedServerConfigPath: createResolver(nitro.options.srcDir).resolve(`/${serverConfigFile}`),
      entrypointWrappedFunctions: moduleOptions.entrypointWrappedFunctions,
      additionalImports: ['import-in-the-middle/hook.mjs'],
      debug: moduleOptions.debug,
    }),
  );
}
