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
