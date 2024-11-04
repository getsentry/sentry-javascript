import * as fs from 'fs';
import * as path from 'path';
import { consoleSandbox, flatten } from '@sentry/utils';

/**
 *  Find the default SDK init file for the given type (client or server).
 *  The sentry.server.config file is prioritized over the instrument.server file.
 */
export function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
  const cwd = process.cwd();

  const filePaths: string[] = [];
  if (type === 'server') {
    for (const ext of possibleFileExtensions) {
      // order is important here - we want to prioritize the server.config file
      filePaths.push(path.join(cwd, `sentry.${type}.config.${ext}`));
      filePaths.push(path.join(cwd, 'public', `instrument.${type}.${ext}`));
    }
  } else {
    for (const ext of possibleFileExtensions) {
      filePaths.push(path.join(cwd, `sentry.${type}.config.${ext}`));
    }
  }

  return filePaths.find(filename => fs.existsSync(filename));
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
