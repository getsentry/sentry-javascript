import { consoleSandbox, flatten } from '@sentry/utils';
import type { InputPluginOption } from 'rollup';

export const SENTRY_WRAPPED_ENTRY = '?sentry-query-wrapped-entry';
export const SENTRY_WRAPPED_FUNCTIONS = '?sentry-query-wrapped-functions=';
export const SENTRY_REEXPORTED_FUNCTIONS = '?sentry-query-reexported-functions=';
export const QUERY_END_INDICATOR = 'SENTRY-QUERY-END';

export type WrapServerEntryPluginOptions = {
  serverEntrypointFileName: string;
  serverConfigFileName: string;
  resolvedServerConfigPath: string;
  entrypointWrappedFunctions: string[];
  additionalImports?: string[];
  debug?: boolean;
};

/**
 * A Rollup plugin which wraps the server entry with a dynamic `import()`. This makes it possible to initialize Sentry first
 * by using a regular `import` and load the server after that.
 * This also works with serverless `handler` functions, as it re-exports the `handler`.
 *
 * @param config Configuration options for the Rollup Plugin
 * @param config.serverConfigFileName Name of the Sentry server config (without file extension). E.g. 'sentry.server.config'
 * @param config.resolvedServerConfigPath Resolved path of the Sentry server config (based on `src` directory)
 * @param config.entryPointWrappedFunctions Exported bindings of the server entry file, which are wrapped as async function. E.g. ['default', 'handler', 'server']
 * @param config.additionalImports Adds additional imports to the entry file. Can be e.g. 'import-in-the-middle/hook.mjs'
 * @param config.debug Whether debug logs are enabled in the build time environment
 */
export function wrapServerEntryWithDynamicImport(config: WrapServerEntryPluginOptions): InputPluginOption {
  const {
    serverEntrypointFileName,
    serverConfigFileName,
    resolvedServerConfigPath,
    entrypointWrappedFunctions,
    additionalImports,
    debug,
  } = config;

  return {
    name: 'sentry-wrap-server-entry-with-dynamic-import',
    async resolveId(source, importer, options) {
      if (source.includes(`/${serverConfigFileName}`)) {
        return { id: source, moduleSideEffects: true };
      }

      if (additionalImports && additionalImports.includes(source)) {
        // When importing additional imports like "import-in-the-middle/hook.mjs" in the returned code of the `load()` function below:
        // By setting `moduleSideEffects` to `true`, the import is added to the bundle, although nothing is imported from it
        // By importing "import-in-the-middle/hook.mjs", we can make sure this file is included, as not all node builders are including files imported with `module.register()`.
        // Prevents the error "Failed to register ESM hook Error: Cannot find module 'import-in-the-middle/hook.mjs'"
        return { id: source, moduleSideEffects: true, external: true };
      }

      if (
        options.isEntry &&
        source.includes(serverEntrypointFileName) &&
        source.includes('.mjs') &&
        !source.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)
      ) {
        const resolution = await this.resolve(source, importer, options);

        // If it cannot be resolved or is external, just return it so that Rollup can display an error
        if (!resolution || (resolution && resolution.external)) return resolution;

        const moduleInfo = await this.load(resolution);

        moduleInfo.moduleSideEffects = true;

        // The enclosing `if` already checks for the suffix in `source`, but a check in `resolution.id` is needed as well to prevent multiple attachment of the suffix
        return resolution.id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)
          ? resolution.id
          : resolution.id
              // Concatenates the query params to mark the file (also attaches names of re-exports - this is needed for serverless functions to re-export the handler)
              .concat(SENTRY_WRAPPED_ENTRY)
              .concat(
                constructWrappedFunctionExportQuery(moduleInfo.exportedBindings, entrypointWrappedFunctions, debug),
              )
              .concat(QUERY_END_INDICATOR);
      }
      return null;
    },
    load(id: string) {
      if (id.includes(`.mjs${SENTRY_WRAPPED_ENTRY}`)) {
        const entryId = removeSentryQueryFromPath(id);

        // Mostly useful for serverless `handler` functions
        const reExportedFunctions =
          id.includes(SENTRY_WRAPPED_FUNCTIONS) || id.includes(SENTRY_REEXPORTED_FUNCTIONS)
            ? constructFunctionReExport(id, entryId)
            : '';

        return (
          // Regular `import` of the Sentry config
          `import ${JSON.stringify(resolvedServerConfigPath)};\n` +
          // Dynamic `import()` for the previous, actual entry point.
          // `import()` can be used for any code that should be run after the hooks are registered (https://nodejs.org/api/module.html#enabling)
          `import(${JSON.stringify(entryId)});\n` +
          // By importing additional imports like "import-in-the-middle/hook.mjs", we can make sure this file wil be included, as not all node builders are including files imported with `module.register()`.
          `${additionalImports ? additionalImports.map(importPath => `import "${importPath}";\n`) : ''}` +
          `${reExportedFunctions}\n`
        );
      }

      return null;
    },
  };
}

/**
 * Strips the Sentry query part from a path.
 * Example: example/path?sentry-query-wrapped-entry?sentry-query-functions-reexport=foo,SENTRY-QUERY-END -> /example/path
 *
 * **Only exported for testing**
 */
export function removeSentryQueryFromPath(url: string): string {
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
  const regex = new RegExp(`\\${SENTRY_WRAPPED_ENTRY}.*?\\${QUERY_END_INDICATOR}`);
  return url.replace(regex, '');
}

/**
 * Extracts and sanitizes function re-export and function wrap query parameters from a query string.
 * If it is a default export, it is not considered for re-exporting.
 *
 * **Only exported for testing**
 */
export function extractFunctionReexportQueryParameters(query: string): { wrap: string[]; reexport: string[] } {
  // Regex matches the comma-separated params between the functions query
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
  const wrapRegex = new RegExp(
    `\\${SENTRY_WRAPPED_FUNCTIONS}(.*?)(\\${QUERY_END_INDICATOR}|\\${SENTRY_REEXPORTED_FUNCTIONS})`,
  );
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
  const reexportRegex = new RegExp(`\\${SENTRY_REEXPORTED_FUNCTIONS}(.*?)(\\${QUERY_END_INDICATOR})`);

  const wrapMatch = query.match(wrapRegex);
  const reexportMatch = query.match(reexportRegex);

  const wrap =
    wrapMatch && wrapMatch[1]
      ? wrapMatch[1]
          .split(',')
          .filter(param => param !== '')
          // Sanitize, as code could be injected with another rollup plugin
          .map((str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      : [];

  const reexport =
    reexportMatch && reexportMatch[1]
      ? reexportMatch[1]
          .split(',')
          .filter(param => param !== '' && param !== 'default')
          // Sanitize, as code could be injected with another rollup plugin
          .map((str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      : [];

  return { wrap, reexport };
}

/**
 *  Constructs a comma-separated string with all functions that need to be re-exported later from the server entry.
 *  It uses Rollup's `exportedBindings` to determine the functions to re-export. Functions which should be wrapped
 *  (e.g. serverless handlers) are wrapped by Sentry.
 *
 *  **Only exported for testing**
 */
export function constructWrappedFunctionExportQuery(
  exportedBindings: Record<string, string[]> | null,
  entrypointWrappedFunctions: string[],
  debug?: boolean,
): string {
  // `exportedBindings` can look like this:  `{ '.': [ 'handler' ] }` or `{ '.': [], './firebase-gen-1.mjs': [ 'server' ] }`
  // The key `.` refers to exports within the current file, while other keys show from where exports were imported first.
  const functionsToExport = flatten(Object.values(exportedBindings || {})).reduce(
    (functions, currFunctionName) => {
      if (entrypointWrappedFunctions.includes(currFunctionName)) {
        functions.wrap.push(currFunctionName);
      } else {
        functions.reexport.push(currFunctionName);
      }
      return functions;
    },
    { wrap: [], reexport: [] } as { wrap: string[]; reexport: string[] },
  );

  if (debug && functionsToExport.wrap.length === 0) {
    consoleSandbox(() =>
      // eslint-disable-next-line no-console
      console.warn(
        "[Sentry] No functions found to wrap. In case the server needs to export async functions other than `handler` or  `server`, consider adding the name(s) to Sentry's build options `sentry.entrypointWrappedFunctions` in `nuxt.config.ts`.",
      ),
    );
  }

  const wrapQuery = functionsToExport.wrap.length
    ? `${SENTRY_WRAPPED_FUNCTIONS}${functionsToExport.wrap.join(',')}`
    : '';
  const reexportQuery = functionsToExport.reexport.length
    ? `${SENTRY_REEXPORTED_FUNCTIONS}${functionsToExport.reexport.join(',')}`
    : '';

  return [wrapQuery, reexportQuery].join('');
}

/**
 * Constructs a code snippet with function reexports (can be used in Rollup plugins as a return value for `load()`)
 *
 * **Only exported for testing**
 */
export function constructFunctionReExport(pathWithQuery: string, entryId: string): string {
  const { wrap: wrapFunctions, reexport: reexportFunctions } = extractFunctionReexportQueryParameters(pathWithQuery);

  return wrapFunctions
    .reduce(
      (functionsCode, currFunctionName) =>
        functionsCode.concat(
          `async function ${currFunctionName}_sentryWrapped(...args) {\n` +
            `  const res = await import(${JSON.stringify(entryId)});\n` +
            `  return res.${currFunctionName}.call(this, ...args);\n` +
            '}\n' +
            `export { ${currFunctionName}_sentryWrapped as ${currFunctionName} };\n`,
        ),
      '',
    )
    .concat(
      reexportFunctions.reduce(
        (functionsCode, currFunctionName) =>
          functionsCode.concat(`export { ${currFunctionName} } from ${JSON.stringify(entryId)};`),
        '',
      ),
    );
}
