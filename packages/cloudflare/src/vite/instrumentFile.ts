import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

// Fallback options callback used when no instrument file is present. Returning
// `undefined` makes the SDK read all configuration (DSN, release, environment,
// sample rate, …) from the worker's `env` at runtime.
export const ENV_FALLBACK_OPTIONS_FN = '() => undefined';

// Identifier the generated import binds the user's options module to.
const OPTIONS_IMPORT_IDENTIFIER = '__SENTRY_OPTIONS_CALLBACK__';

// Conventional, non-configurable name of the Sentry options module. It is
// looked up next to the worker entry file; its default export is the options
// callback `(env) => CloudflareOptions`.
const INSTRUMENT_FILE_BASENAME = 'instrument.server';
const INSTRUMENT_FILE_EXTENSIONS = ['ts', 'mts', 'js', 'mjs', 'cjs'];

/**
 * Locate the conventional `instrument.server.*` module sitting next to the
 * worker entry file. Returns its absolute path, or `undefined` when absent.
 */
export function resolveInstrumentFile(entryFilePath: string): string | undefined {
  const dir = dirname(entryFilePath);
  for (const ext of INSTRUMENT_FILE_EXTENSIONS) {
    const candidate = resolve(dir, `${INSTRUMENT_FILE_BASENAME}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Build the `optionsFn` reference and `import` statement for the instrument
 * module whose **default export** is the options callback
 * `(env) => CloudflareOptions`.
 *
 * The import is emitted relative to `entryFilePath` because it is injected into
 * the entry file's source. The file extension is kept: extensionless specifiers
 * only resolve for extensions in Vite's default `resolve.extensions` (which
 * excludes `.cjs`), and keeping it makes our probe order authoritative when
 * several `instrument.server.*` files coexist.
 */
export function buildOptionsImport(
  entryFilePath: string,
  instrumentFilePath: string,
): { optionsFn: string; importStmt: string } {
  let relativePath = relative(dirname(entryFilePath), instrumentFilePath).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) relativePath = `./${relativePath}`;

  return {
    optionsFn: OPTIONS_IMPORT_IDENTIFIER,
    importStmt: `import ${OPTIONS_IMPORT_IDENTIFIER} from '${relativePath}';\n`,
  };
}
