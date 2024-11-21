import * as fs from 'fs';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/core';
import type { Nitro } from 'nitropack';
import type { InputPluginOption } from 'rollup';
import type { SentryNuxtModuleOptions } from '../common/types';
import {
  QUERY_END_INDICATOR,
  SENTRY_REEXPORTED_FUNCTIONS,
  SENTRY_WRAPPED_ENTRY,
  SENTRY_WRAPPED_FUNCTIONS,
  constructFunctionReExport,
  constructWrappedFunctionExportQuery,
  removeSentryQueryFromPath,
} from './utils';

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
    wrapEntryWithDynamicImport({
      resolvedSentryConfigPath: createResolver(nitro.options.srcDir).resolve(`/${serverConfigFile}`),
      entrypointWrappedFunctions: moduleOptions.entrypointWrappedFunctions,
    }),
  );
}

/**
 * A Rollup plugin which wraps the server entry with a dynamic `import()`. This makes it possible to initialize Sentry first
 * by using a regular `import` and load the server after that.
 * This also works with serverless `handler` functions, as it re-exports the `handler`.
 */
function wrapEntryWithDynamicImport({
  resolvedSentryConfigPath,
  entrypointWrappedFunctions,
  debug,
}: { resolvedSentryConfigPath: string; entrypointWrappedFunctions: string[]; debug?: boolean }): InputPluginOption {
  // In order to correctly import the server config file
  // and dynamically import the nitro runtime, we need to
  // mark the resolutionId with '\0raw' to fall into the
  // raw chunk group, c.f. https://github.com/nitrojs/nitro/commit/8b4a408231bdc222569a32ce109796a41eac4aa6#diff-e58102d2230f95ddeef2662957b48d847a6e891e354cfd0ae6e2e03ce848d1a2R142
  const resolutionIdPrefix = '\0raw';

  return {
    name: 'sentry-wrap-entry-with-dynamic-import',
    async resolveId(source, importer, options) {
      if (source.includes(`/${SERVER_CONFIG_FILENAME}`)) {
        return { id: source, moduleSideEffects: true };
      }

      if (source === 'import-in-the-middle/hook.mjs') {
        // We are importing "import-in-the-middle" in the returned code of the `load()` function below
        // By setting `moduleSideEffects` to `true`, the import is added to the bundle, although nothing is imported from it
        // By importing "import-in-the-middle/hook.mjs", we can make sure this file is included, as not all node builders are including files imported with `module.register()`.
        // Prevents the error "Failed to register ESM hook Error: Cannot find module 'import-in-the-middle/hook.mjs'"
        return { id: source, moduleSideEffects: true, external: true };
      }

      if (options.isEntry && source.includes('.mjs') && !source.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)) {
        const resolution = await this.resolve(source, importer, options);

        // If it cannot be resolved or is external, just return it so that Rollup can display an error
        if (!resolution || resolution?.external) return resolution;

        const moduleInfo = await this.load(resolution);

        moduleInfo.moduleSideEffects = true;

        // The enclosing `if` already checks for the suffix in `source`, but a check in `resolution.id` is needed as well to prevent multiple attachment of the suffix
        return resolution.id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)
          ? resolution.id
          : `${resolutionIdPrefix}${resolution.id
              // Concatenates the query params to mark the file (also attaches names of re-exports - this is needed for serverless functions to re-export the handler)
              .concat(SENTRY_WRAPPED_ENTRY)
              .concat(
                constructWrappedFunctionExportQuery(moduleInfo.exportedBindings, entrypointWrappedFunctions, debug),
              )
              .concat(QUERY_END_INDICATOR)}`;
      }
      return null;
    },
    load(id: string) {
      if (id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)) {
        const entryId = removeSentryQueryFromPath(id).slice(resolutionIdPrefix.length);

        // Mostly useful for serverless `handler` functions
        const reExportedFunctions =
          id.includes(SENTRY_WRAPPED_FUNCTIONS) || id.includes(SENTRY_REEXPORTED_FUNCTIONS)
            ? constructFunctionReExport(id, entryId)
            : '';

        return (
          // Regular `import` of the Sentry config
          `import ${JSON.stringify(resolvedSentryConfigPath)};\n` +
          // Dynamic `import()` for the previous, actual entry point.
          // `import()` can be used for any code that should be run after the hooks are registered (https://nodejs.org/api/module.html#enabling)
          `import(${JSON.stringify(entryId)});\n` +
          // By importing "import-in-the-middle/hook.mjs", we can make sure this file wil be included, as not all node builders are including files imported with `module.register()`.
          "import 'import-in-the-middle/hook.mjs';\n" +
          `${reExportedFunctions}\n`
        );
      }

      return null;
    },
  };
}
