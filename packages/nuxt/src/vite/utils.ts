import { consoleSandbox } from '@sentry/core';
import * as fs from 'fs';
import type { Nuxt } from 'nuxt/schema';
import * as path from 'path';

/**
 *  Find the default SDK init file for the given type (client or server).
 *  The sentry.server.config file is prioritized over the instrument.server file.
 */
export function findDefaultSdkInitFile(type: 'server' | 'client', nuxt?: Nuxt): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
  const relativePaths: string[] = [];

  if (type === 'server') {
    for (const ext of possibleFileExtensions) {
      relativePaths.push(`sentry.${type}.config.${ext}`);
      relativePaths.push(path.join('public', `instrument.${type}.${ext}`));
    }
  } else {
    for (const ext of possibleFileExtensions) {
      relativePaths.push(`sentry.${type}.config.${ext}`);
    }
  }

  // Get layers from highest priority to lowest
  const layers = [...(nuxt?.options._layers ?? [])].reverse();

  for (const layer of layers) {
    for (const relativePath of relativePaths) {
      const fullPath = path.resolve(layer.cwd, relativePath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // As a fallback, also check CWD (left for pure compatibility)
  const cwd = process.cwd();
  for (const relativePath of relativePaths) {
    const fullPath = path.resolve(cwd, relativePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

/**
 *  Extracts the filename from a node command with a path.
 */
export function getFilenameFromNodeStartCommand(nodeCommand: string): string | null {
  const regex = /[^/\\]+\.[^/\\]+$/;
  const match = nodeCommand.match(regex);
  return match ? match[0] : null;
}

export const SENTRY_WRAPPED_ENTRY = '?sentry-query-wrapped-entry';
export const SENTRY_WRAPPED_FUNCTIONS = '?sentry-query-wrapped-functions=';
export const SENTRY_REEXPORTED_FUNCTIONS = '?sentry-query-reexported-functions=';
export const QUERY_END_INDICATOR = 'SENTRY-QUERY-END';

/**
 * Strips the Sentry query part from a path.
 * Example: example/path?sentry-query-wrapped-entry?sentry-query-functions-reexport=foo,SENTRY-QUERY-END -> /example/path
 *
 * Only exported for testing.
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
 * Only exported for testing.
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
    wrapMatch?.[1]
      ?.split(',')
      .filter(param => param !== '')
      // Sanitize, as code could be injected with another rollup plugin
      .map((str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) || [];

  const reexport =
    reexportMatch?.[1]
      ?.split(',')
      .filter(param => param !== '' && param !== 'default')
      // Sanitize, as code could be injected with another rollup plugin
      .map((str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) || [];

  return { wrap, reexport };
}

/**
 *  Constructs a comma-separated string with all functions that need to be re-exported later from the server entry.
 *  It uses Rollup's `exportedBindings` to determine the functions to re-export. Functions which should be wrapped
 *  (e.g. serverless handlers) are wrapped by Sentry.
 */
export function constructWrappedFunctionExportQuery(
  exportedBindings: Record<string, string[]> | null,
  entrypointWrappedFunctions: string[],
  debug?: boolean,
): string {
  const functionsToExport: { wrap: string[]; reexport: string[] } = {
    wrap: [],
    reexport: [],
  };

  // `exportedBindings` can look like this:  `{ '.': [ 'handler' ] }` or `{ '.': [], './firebase-gen-1.mjs': [ 'server' ] }`
  // The key `.` refers to exports within the current file, while other keys show from where exports were imported first.
  Object.values(exportedBindings || {}).forEach(functions =>
    functions.forEach(fn => {
      if (entrypointWrappedFunctions.includes(fn)) {
        functionsToExport.wrap.push(fn);
      } else {
        functionsToExport.reexport.push(fn);
      }
    }),
  );

  if (debug && functionsToExport.wrap.length === 0) {
    consoleSandbox(() =>
      // eslint-disable-next-line no-console
      console.warn(
        "[Sentry] No functions found to wrap. In case the server needs to export async functions other than `handler` or  `server`, consider adding the name(s) to Sentry's build options `sentry.experimental_entrypointWrappedFunctions` in `nuxt.config.ts`.",
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

/**
 * Sets up alias to work around OpenTelemetry's incomplete ESM imports.
 * https://github.com/getsentry/sentry-javascript/issues/15204
 *
 * OpenTelemetry's @opentelemetry/resources package has incomplete imports missing
 * the .js file extensions (like execAsync for machine-id detection). This causes module resolution
 * errors in certain Nuxt configurations, particularly when local Nuxt modules in Nuxt 4 are present.
 *
 * @see https://nuxt.com/docs/guide/concepts/esm#aliasing-libraries
 */
export function addOTelCommonJSImportAlias(nuxt: Nuxt): void {
  if (!nuxt.options.dev) {
    return;
  }

  if (!nuxt.options.alias) {
    nuxt.options.alias = {};
  }

  if (!nuxt.options.alias['@opentelemetry/resources']) {
    nuxt.options.alias['@opentelemetry/resources'] = '@opentelemetry/resources/build/src/index.js';
  }
}
