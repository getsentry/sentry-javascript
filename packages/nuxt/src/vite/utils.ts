import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import type { SentryNuxtModuleOptions } from '../common/types';
import { resolvePath } from '@nuxt/kit';

/**
 * Gets the major version of the Nitro package used by the app's Nuxt installation.
 * Returns 2 as the default if the version cannot be determined.
 *
 * Nitro v2 is published as `nitropack`, v3 as `nitro`. Resolving `nitro` directly is
 * unreliable: module resolution walks up the directory tree, so in a monorepo an
 * unrelated `nitro` v3 above the app wins even when the app's Nuxt uses `nitropack` v2.
 * Instead, follow the dependency chain Nuxt itself imports Nitro through:
 * `nuxt` -> (`@nuxt/nitro-server` ->) `nitro` | `nitropack`.
 */
export async function getNitroMajorVersion(rootDir: string): Promise<number> {
  try {
    const { getPackageInfo } = await import('local-pkg');

    // `paths` entries must point at a file: for a bare directory, resolution starts at the
    // directory's parent and skips the directory's own `node_modules`, so a hoisted copy higher
    // up the tree (e.g. a monorepo root) wins over the app's actual dependency.
    const fromPackage = (dir: string): { paths: string[] } => ({ paths: [path.join(dir, 'package.json')] });

    // The package that declares the Nitro dependency: `nuxt` itself, or `@nuxt/nitro-server` (Nuxt >= 3.21) when nuxt delegates to it
    let provider = await getPackageInfo('nuxt', fromPackage(rootDir));
    if (provider?.packageJson.dependencies?.['@nuxt/nitro-server']) {
      provider = (await getPackageInfo('@nuxt/nitro-server', fromPackage(provider.rootPath))) ?? provider;
    }

    if (!provider?.packageJson.dependencies?.nitro) {
      return 2;
    }

    const info = await getPackageInfo('nitro', fromPackage(provider.rootPath));
    const major = parseInt(info?.version?.split('.')[0] ?? '', 10);
    // The provider imports `nitro` (not `nitropack`), so it is at least v3 even if the version is unreadable
    return isNaN(major) ? 3 : major;
  } catch {
    // If local-pkg is unavailable or resolution fails, default to v2
    return 2;
  }
}

/**
 *  Find the default SDK init file for the given type (client or server).
 */
export async function findDefaultSdkInitFile(
  type: 'server' | 'client',
  nuxt?: Nuxt,
  options?: SentryNuxtModuleOptions,
): Promise<string | undefined> {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
  const relativePaths = possibleFileExtensions.map(ext => `sentry.${type}.config.${ext}`);

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
  const rootDir = options?.configDir ? await resolvePath(options.configDir, { type: 'dir' }) : process.cwd();
  for (const relativePath of relativePaths) {
    const fullPath = path.resolve(rootDir, relativePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

export const SERVER_CONFIG_FILENAME = 'sentry.server.config';

/** Whether a resolved Nitro preset targets Cloudflare (workerd). Nitro normalizes preset names, so any `cloudflare*` spelling matches. */
export function isCloudflarePreset(preset: string | undefined): boolean {
  return !!preset?.replace(/-/g, '_').startsWith('cloudflare');
}

/** Builds the value for `node --import`. Node reads it as a URL, so it needs forward slashes on Windows too. */
export function toImportSpecifier(fromDir: string, filePath: string): string {
  return `./${path.relative(fromDir, filePath).split(/[\\/]/).join('/')}`;
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
  // oxlint-disable-next-line sdk/no-regexp-constructor
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
  // oxlint-disable-next-line sdk/no-regexp-constructor
  const wrapRegex = new RegExp(
    `\\${SENTRY_WRAPPED_FUNCTIONS}(.*?)(\\${QUERY_END_INDICATOR}|\\${SENTRY_REEXPORTED_FUNCTIONS})`,
  );
  // oxlint-disable-next-line sdk/no-regexp-constructor
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
 * `load()` emits `file://` specifiers because Node's ESM loader rejects bare Windows
 * paths (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), but Rollup's resolver only understands
 * filesystem paths. Returns `undefined` for a malformed `file://` URL.
 *
 * Only exported for testing.
 */
export function toResolvablePath(source: string): { path: string; wasFileUrl: boolean } | undefined {
  if (!source.startsWith('file://')) {
    return { path: source, wasFileUrl: false };
  }
  if (source === 'file://' || source === 'file:///') {
    return undefined;
  }
  try {
    const filePath = fileURLToPath(source);
    if (!filePath || filePath === '/' || filePath === '\\') {
      return undefined;
    }
    return { path: filePath, wasFileUrl: true };
  } catch {
    return undefined;
  }
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
export function addOTelCommonJSImportAlias(nuxt: Nuxt, isNitroV3 = false): void {
  if (!nuxt.options.dev || isNitroV3) {
    return;
  }

  if (!nuxt.options.alias) {
    nuxt.options.alias = {};
  }

  if (!nuxt.options.alias['@opentelemetry/resources']) {
    nuxt.options.alias['@opentelemetry/resources'] = '@opentelemetry/resources/build/src/index.js';
  }
}
