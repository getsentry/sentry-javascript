import * as fs from 'fs';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/utils';
import type { Nitro } from 'nitropack';
import type { InputPluginOption } from 'rollup';
import type { SentryNuxtModuleOptions } from '../common/types';
import {
  QUERY_END_INDICATOR,
  SENTRY_FUNCTIONS_REEXPORT,
  SENTRY_WRAPPED_ENTRY,
  constructFunctionReExport,
  stripQueryPart,
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
 *  Adds the Sentry server config import at the top of the server entry file to load the SDK on the server.
 *  This is necessary for environments where modifying the node option `--import` is not possible.
 *  However, only limited tracing instrumentation is supported when doing this.
 */
export function addSentryTopImport(moduleOptions: SentryNuxtModuleOptions, nitro: Nitro): void {
  nitro.hooks.hook('close', () => {
    // other presets ('node-server' or 'vercel') have an index.mjs
    const presetsWithServerFile = ['netlify'];
    const entryFileName =
      typeof nitro.options.rollupConfig?.output.entryFileNames === 'string'
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
            consoleSandbox(() => {
              // eslint-disable-next-line no-console
              console.log(
                `[Sentry] Successfully added the Sentry import to the server entry file "\`${entryFilePath}\`"`,
              );
            });
          }
        });
      });
    } catch (err) {
      if (moduleOptions.debug) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            `[Sentry] An error occurred when trying to add the Sentry import to the server entry file "\`${entryFilePath}\`":`,
            err,
          );
        });
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
export function addDynamicImportEntryFileWrapper(nitro: Nitro, serverConfigFile: string): void {
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
    // @ts-expect-error - This is the correct type, but it shows an error because of two different definitions
    wrapEntryWithDynamicImport(createResolver(nitro.options.srcDir).resolve(`/${serverConfigFile}`)),
  );
}

function wrapEntryWithDynamicImport(resolvedSentryConfigPath: string): InputPluginOption {
  const containsSuffix = (sourcePath: string): boolean => {
    return sourcePath.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`) || sourcePath.includes(SENTRY_FUNCTIONS_REEXPORT);
  };

  return {
    name: 'sentry-wrap-entry-with-dynamic-import',
    async resolveId(source, importer, options) {
      if (source.includes(`/${SERVER_CONFIG_FILENAME}`)) {
        return { id: source, moduleSideEffects: true };
      }

      if (source === 'import-in-the-middle/hook.mjs') {
        return { id: source, moduleSideEffects: true, external: true };
      }

      if (options.isEntry && !source.includes(SENTRY_WRAPPED_ENTRY)) {
        const resolution = await this.resolve(source, importer, options);

        // If it cannot be resolved or is external, just return it
        // so that Rollup can display an error
        if (!resolution || resolution?.external) return resolution;

        const moduleInfo = await this.load(resolution);

        moduleInfo.moduleSideEffects = true;

        const exportedFunctions = moduleInfo.exportedBindings?.['.'];

        // checks are needed to prevent multiple attachment of the suffix
        return containsSuffix(source) || containsSuffix(resolution.id)
          ? resolution.id
          : resolution.id
              // concat the query params to mark the file (also attaches names of exports - this is needed for serverless functions to re-export the handler)
              .concat(SENTRY_WRAPPED_ENTRY)
              .concat(
                exportedFunctions?.length
                  ? SENTRY_FUNCTIONS_REEXPORT.concat(exportedFunctions.join(',')).concat(QUERY_END_INDICATOR)
                  : '',
              );
      }
      return null;
    },
    load(id: string) {
      if (id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)) {
        const entryId = stripQueryPart(id);

        const reExportedFunctions = id.includes(SENTRY_FUNCTIONS_REEXPORT)
          ? constructFunctionReExport(id, entryId)
          : '';

        return (
          // Import the Sentry server config
          `import ${JSON.stringify(resolvedSentryConfigPath)};\n` +
          // Dynamic import for the previous, actual entry point.
          // import() can be used for any code that should be run after the hooks are registered (https://nodejs.org/api/module.html#enabling)
          `import(${JSON.stringify(entryId)});\n` +
          `${reExportedFunctions}\n`
        );
      }

      return null;
    },
  };
}
