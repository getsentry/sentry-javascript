import * as fs from 'fs';
import * as path from 'path';

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
export const SENTRY_FUNCTIONS_REEXPORT = '?sentry-query-functions-reexport=';
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
 * Extracts and sanitizes function re-export query parameters from a query string.
 * If it is a default export, it is not considered for re-exporting. This function is mostly relevant for re-exporting
 * serverless `handler` functions.
 *
 * Only exported for testing.
 */
export function extractFunctionReexportQueryParameters(query: string): string[] {
  // Regex matches the comma-separated params between the functions query
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
  const regex = new RegExp(`\\${SENTRY_FUNCTIONS_REEXPORT}(.*?)\\${QUERY_END_INDICATOR}`);
  const match = query.match(regex);

  return match && match[1]
    ? match[1]
        .split(',')
        .filter(param => param !== '' && param !== 'default')
        // Sanitize, as code could be injected with another rollup plugin
        .map((str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : [];
}

/**
 * Constructs a code snippet with function reexports (can be used in Rollup plugins)
 */
export function constructFunctionReExport(pathWithQuery: string, entryId: string): string {
  const functionNames = extractFunctionReexportQueryParameters(pathWithQuery);

  return functionNames.reduce(
    (functionsCode, currFunctionName) =>
      functionsCode.concat(
        `export async function ${currFunctionName}(...args) {\n` +
          `  const res = await import(${JSON.stringify(entryId)});\n` +
          `  return res.${currFunctionName}.call(this, ...args);\n` +
          '}\n',
      ),
    '',
  );
}
