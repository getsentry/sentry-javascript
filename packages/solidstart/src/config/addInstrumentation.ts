import * as fs from 'fs';
import * as path from 'path';
import { consoleSandbox, flatten } from '@sentry/utils';
import type { Nitro } from 'nitropack';
import type { InputPluginOption } from 'rollup';
import type { RollupConfig } from './types';
import {
  QUERY_END_INDICATOR,
  SENTRY_FUNCTIONS_REEXPORT,
  SENTRY_WRAPPED_ENTRY,
  constructFunctionReExport,
  removeSentryQueryFromPath,
} from './utils';

// Nitro presets for hosts that only host static files
export const staticHostPresets = ['github_pages'];
// Nitro presets for hosts that use `server.mjs` as opposed to `index.mjs`
export const serverFilePresets = ['netlify'];

/**
 * Adds the built `instrument.server.js` file to the output directory.
 *
 * This will no-op if no `instrument.server.js` file was found in the
 * build directory. Make sure the `sentrySolidStartVite` plugin was
 * added to `app.config.ts` to enable building the instrumentation file.
 */
export async function addInstrumentationFileToBuild(nitro: Nitro): Promise<void> {
  // Static file hosts have no server component so there's nothing to do
  if (staticHostPresets.includes(nitro.options.preset)) {
    return;
  }

  const buildDir = nitro.options.buildDir;
  const serverDir = nitro.options.output.serverDir;
  const source = path.resolve(buildDir, 'build', 'ssr', 'instrument.server.js');
  const destination = path.resolve(serverDir, 'instrument.server.mjs');

  try {
    await fs.promises.copyFile(source, destination);

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(`[Sentry SolidStart withSentry] Successfully created ${destination}.`);
    });
  } catch (error) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(`[Sentry SolidStart withSentry] Failed to create ${destination}.`, error);
    });
  }
}

/**
 *
 */
export async function addAutoInstrumentation(nitro: Nitro, config: RollupConfig): Promise<void> {
  // Static file hosts have no server component so there's nothing to do
  if (staticHostPresets.includes(nitro.options.preset)) {
    return;
  }

  const buildDir = nitro.options.buildDir;
  const serverInstrumentationPath = path.resolve(buildDir, 'build', 'ssr', 'instrument.server.js');

  config.plugins.push({
    name: 'sentry-solidstart-auto-instrument',
    async resolveId(source, importer, options) {
      if (source.includes('instrument.server.js')) {
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

        // The key `.` in `exportedBindings` refer to the exports within the file
        const functionsToExport = flatten(Object.values(moduleInfo.exportedBindings || {})).filter(functionName =>
          ['default', 'handler', 'server'].includes(functionName),
        );

        // The enclosing `if` already checks for the suffix in `source`, but a check in `resolution.id` is needed as well to prevent multiple attachment of the suffix
        return resolution.id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)
          ? resolution.id
          : resolution.id
              // Concatenates the query params to mark the file (also attaches names of re-exports - this is needed for serverless functions to re-export the handler)
              .concat(SENTRY_WRAPPED_ENTRY)
              .concat(functionsToExport?.length ? SENTRY_FUNCTIONS_REEXPORT.concat(functionsToExport.join(',')) : '')
              .concat(QUERY_END_INDICATOR);
      }

      return null;
    },
    load(id: string) {
      if (id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)) {
        const entryId = removeSentryQueryFromPath(id);

        // Mostly useful for serverless `handler` functions
        const reExportedFunctions = id.includes(SENTRY_FUNCTIONS_REEXPORT)
          ? constructFunctionReExport(id, entryId)
          : '';

        return [
          // Regular `import` of the Sentry config
          `import ${JSON.stringify(serverInstrumentationPath)};`,
          // Dynamic `import()` for the previous, actual entry point.
          // `import()` can be used for any code that should be run after the hooks are registered (https://nodejs.org/api/module.html#enabling)
          `import(${JSON.stringify(entryId)});`,
          // By importing "import-in-the-middle/hook.mjs", we can make sure this file wil be included, as not all node builders are including files imported with `module.register()`.
          "import 'import-in-the-middle/hook.mjs';",
          `${reExportedFunctions}`,
        ].join('\n');
      }

      return null;
    },
  } satisfies InputPluginOption);
}
