import { existsSync } from 'node:fs';
import { createResolver } from '@nuxt/kit';
import { debug } from '@sentry/core';
import * as fs from 'fs';
import type { Nitro } from 'nitropack';
import type { InputPluginOption } from 'rollup';
import type { SentryNuxtModuleOptions } from '../common/types';
import {
  constructFunctionReExport,
  constructWrappedFunctionExportQuery,
  getFilenameFromNodeStartCommand,
  QUERY_END_INDICATOR,
  removeSentryQueryFromPath,
  SENTRY_REEXPORTED_FUNCTIONS,
  SENTRY_WRAPPED_ENTRY,
  SENTRY_WRAPPED_FUNCTIONS,
} from './utils';

const SERVER_CONFIG_FILENAME = 'sentry.server.config';

/**
 *  Adds the `sentry.server.config.ts` file as `sentry.server.config.mjs` to the `.output` directory to be able to reference this file in the node --import option.
 *
 *  By adding a Rollup plugin to the Nitro Rollup options, the Sentry server config is transpiled and emitted to the server build.
 */
export function addServerConfigToBuild(
  moduleOptions: SentryNuxtModuleOptions,
  nitro: Nitro,
  serverConfigFile: string,
): void {
  nitro.hooks.hook('rollup:before', (nitro, rollupConfig) => {
    if (rollupConfig?.plugins === null || rollupConfig?.plugins === undefined) {
      rollupConfig.plugins = [];
    } else if (!Array.isArray(rollupConfig.plugins)) {
      // `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    rollupConfig.plugins.push(injectServerConfigPlugin(nitro, serverConfigFile, moduleOptions.debug));
  });
}

/**
 *  Adds the Sentry server config import at the top of the server entry file to load the SDK on the server.
 *  This is necessary for environments where modifying the node option `--import` is not possible.
 *  However, only limited tracing instrumentation is supported when doing this.
 */
export function addSentryTopImport(moduleOptions: SentryNuxtModuleOptions, nitro: Nitro): void {
  nitro.hooks.hook('close', async () => {
    const fileNameFromCommand =
      nitro.options.commands.preview && getFilenameFromNodeStartCommand(nitro.options.commands.preview);

    // other presets ('node-server' or 'vercel') have an index.mjs
    const presetsWithServerFile = ['netlify'];

    const entryFileName = fileNameFromCommand
      ? fileNameFromCommand
      : typeof nitro.options.rollupConfig?.output.entryFileNames === 'string'
        ? nitro.options.rollupConfig?.output.entryFileNames
        : presetsWithServerFile.includes(nitro.options.preset)
          ? 'server.mjs'
          : 'index.mjs';

    const serverDirResolver = createResolver(nitro.options.output.serverDir);
    const entryFilePath = serverDirResolver.resolve(entryFileName);

    try {
      fs.readFile(entryFilePath, 'utf8', (err, data) => {
        const updatedContent = `import './${SERVER_CONFIG_FILENAME}.mjs';\n${data}`;

        fs.writeFile(entryFilePath, updatedContent, 'utf8', () => {
          if (moduleOptions.debug) {
            // eslint-disable-next-line no-console
            console.log(
              `[Sentry] Successfully added the Sentry import to the server entry file "\`${entryFilePath}\`"`,
            );
          }
        });
      });
    } catch (err) {
      if (moduleOptions.debug) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] An error occurred when trying to add the Sentry import to the server entry file "\`${entryFilePath}\`":`,
          err,
        );
      }
    }
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
  moduleOptions: Omit<SentryNuxtModuleOptions, 'experimental_entrypointWrappedFunctions'> &
    Required<Pick<SentryNuxtModuleOptions, 'experimental_entrypointWrappedFunctions'>>,
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
      experimental_entrypointWrappedFunctions: moduleOptions.experimental_entrypointWrappedFunctions,
    }),
  );
}

/**
 * Rollup plugin to include the Sentry server configuration file to the server build output.
 */
function injectServerConfigPlugin(nitro: Nitro, serverConfigFile: string, isDebug?: boolean): InputPluginOption {
  const filePrefix = '\0virtual:sentry-server-config:';

  return {
    name: 'rollup-plugin-inject-sentry-server-config',

    buildStart() {
      const configPath = createResolver(nitro.options.srcDir).resolve(`/${serverConfigFile}`);

      if (!existsSync(configPath)) {
        if (isDebug) {
          debug.log(`[Sentry] Sentry server config file not found: ${configPath}`);
        }
        return;
      }

      // Emitting a file adds it to the build output (Rollup is aware of the file, and we can later return the code in resolveId)
      this.emitFile({
        type: 'chunk',
        id: `${filePrefix}${serverConfigFile}`,
        fileName: `${SERVER_CONFIG_FILENAME}.mjs`,
      });
    },

    resolveId(source) {
      if (source.startsWith(filePrefix)) {
        const originalFilePath = source.replace(filePrefix, '');
        const configPath = createResolver(nitro.options.rootDir).resolve(`/${originalFilePath}`);

        return { id: configPath };
      }
      return null;
    },
  };
}

/**
 * A Rollup plugin which wraps the server entry with a dynamic `import()`. This makes it possible to initialize Sentry first
 * by using a regular `import` and load the server after that.
 * This also works with serverless `handler` functions, as it re-exports the `handler`.
 */
function wrapEntryWithDynamicImport({
  resolvedSentryConfigPath,
  experimental_entrypointWrappedFunctions,
  debug,
}: {
  resolvedSentryConfigPath: string;
  experimental_entrypointWrappedFunctions: string[];
  debug?: boolean;
}): InputPluginOption {
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
                constructWrappedFunctionExportQuery(
                  moduleInfo.exportedBindings,
                  experimental_entrypointWrappedFunctions,
                  debug,
                ),
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
