import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants, brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'rolldown';

/**
 * Bytes that the generated `console.log(...)` entry adds on its own,
 * measured by bundling an empty `import {}` entry.
 */
const EMPTY_IMPORT_ENTRY = { raw: 14, gzip: 34, brotli: 18 };

/**
 * Bundles and measures every check in a size-limit style config, in order.
 *
 * Each check takes `name`, `path`, `import`, `ignore`, `gzip`, `brotli`, `define`
 * and `modifyRolldownConfig(config)`.
 */
export async function measure(checks, configDir) {
  const results = [];

  for (const check of checks) {
    results.push({ name: check.name, size: await measureCheck(check, configDir) });
  }

  return results;
}

/**
 * Builds one check with rolldown into a temp dir and returns its compressed size in bytes.
 */
async function measureCheck(check, configDir) {
  const outDir = await mkdtemp(join(tmpdir(), 'size-limit-rolldown-'));

  try {
    const paths = [check.path].flat().map(p => (isAbsolute(p) ? p : resolve(configDir, p)));
    const input = check.import ? await writeImportEntry(outDir, paths[0], check.import) : paths;

    let config = {
      input,
      external: createExternal(check.ignore),
      platform: 'browser',
      logLevel: 'silent',
      transform: { define: createDefine(check.define) },
      output: { format: 'esm', minify: true },
    };

    if (check.modifyRolldownConfig) {
      config = check.modifyRolldownConfig(config);
    }

    const { output } = await build({ ...config, write: false });
    const code = output.filter(file => file.type === 'chunk').map(chunk => Buffer.from(chunk.code));
    const compression = getCompression(check);
    const size = code.reduce((total, buffer) => total + compress(buffer, compression), 0);

    return check.import ? size - EMPTY_IMPORT_ENTRY[compression] : size;
  } finally {
    await rm(outDir, { force: true, recursive: true });
  }
}

/**
 * Writes the entry a user would write: import the named exports and use them,
 * so the bundler cannot drop them.
 */
async function writeImportEntry(outDir, path, importSpec) {
  const isNamespace = importSpec === '*';
  const specifier = isNamespace ? '* as all' : importSpec;
  const used = isNamespace ? 'all' : importSpec.replace(/[{}]/g, '').trim();
  const entry = join(outDir, 'index.js');

  await writeFile(entry, `import ${specifier} from ${JSON.stringify(path)};\nconsole.log(${used});\n`);

  return entry;
}

/**
 * Turns `ignore` into an `external` matcher that also covers subpaths (`react/jsx-runtime` for `react`).
 */
function createExternal(ignore) {
  if (!ignore?.length) {
    return undefined;
  }

  const escaped = ignore.map(i => i.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'));
  const pattern = new RegExp(`^(${escaped.join('|')})($|/)`);

  return id => pattern.test(id);
}

/**
 * Turns `define: { __SENTRY_DEBUG__: false }` into the source text rolldown expects.
 */
function createDefine(define) {
  return Object.fromEntries(Object.entries(define ?? {}).map(([key, value]) => [key, JSON.stringify(value)]));
}

/**
 * Mirrors size-limit's defaults: gzip when `gzip: true`, raw when `brotli: false`, brotli otherwise.
 */
function getCompression(check) {
  if (check.gzip === true) {
    return 'gzip';
  }

  return check.brotli === false ? 'raw' : 'brotli';
}

/**
 * Returns the byte length of `buffer` after the given compression, with size-limit's levels.
 */
function compress(buffer, compression) {
  if (compression === 'gzip') {
    return gzipSync(buffer, { level: 9 }).length;
  }

  if (compression === 'brotli') {
    return brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }

  return buffer.length;
}

/**
 * Formats bytes the way size-limit does (1 KB = 1000 B).
 */
function formatBytes(size) {
  return size >= 1000 ? `${(size / 1000).toFixed(2)} kB` : `${size} B`;
}

async function main() {
  const configPath = resolve(process.cwd(), '.size-limit.js');
  const { default: checks } = await import(pathToFileURL(configPath).href);
  const results = await measure(checks, dirname(configPath));

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

    return;
  }

  for (const { name, size } of results) {
    process.stdout.write(`${name}\n  ${formatBytes(size)}\n\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
