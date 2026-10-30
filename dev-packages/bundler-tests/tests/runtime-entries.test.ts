import { describe, expect, test } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { nodeFileTrace, resolve } from '@vercel/nft';

/**
 * Server runtime entries must not reach build-time tooling. When they do,
 * the tooling ends up in server bundles and traced outputs (Next standalone,
 * Nitro, workerd, ...), where it breaks in a different way for each
 * consumer. `@vercel/nft` is the tracer that Next standalone and the Vercel
 * adapters use, so it reports what those consumers would ship.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../..');
const FIXTURE_DIR = path.join(__dirname, '..', 'dist', 'runtime-entries');

const BUILD_TIME_PATTERNS: RegExp[] = [
  /(^|\/)packages\/bundler-plugins\//,
  /(^|\/)node_modules\/@sentry\/bundler-plugins(\/|$)/,
  /(^|\/)packages\/server-utils\/build\/[^/]+\/orchestrion\/bundler\//,
  /(^|\/)node_modules\/(vite|webpack|rollup|esbuild|oxc-parser)\//,
  /(^|\/)node_modules\/@(babel|rollup|oxc-parser)\//,
  /\.wasm$/,
];

const KNOWN_VIOLATIONS = new Set([
  // These root entries also re-export config-time code (`sentryAstro`,
  // `withSentry`). They must keep it until v12 for backwards compatibility.
  '@sentry/astro',
  '@sentry/solidstart',
  // Remix 3 has no bundler. Its asset server runs the orchestrion
  // transform on browser modules at request time.
  '@sentry/remix/v3',
  '@sentry/remix/v3/node',
]);

type Format = 'esm' | 'cjs';

interface Case {
  specifier: string;
  conditions: string[];
  formats: Format[];
}

const NODE = ['node'];
const WORKERD = ['workerd', 'worker'];
const BOTH: Format[] = ['esm', 'cjs'];
const ESM: Format[] = ['esm'];

const CASES: Case[] = [
  { specifier: '@sentry/node', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/node/import', conditions: NODE, formats: ESM },
  { specifier: '@sentry/bun', conditions: ['bun', 'node'], formats: BOTH },
  { specifier: '@sentry/deno', conditions: ['deno', 'node'], formats: ESM },
  { specifier: '@sentry/vercel-edge', conditions: ['edge-light'], formats: BOTH },
  { specifier: '@sentry/cloudflare', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/cloudflare', conditions: [...WORKERD, 'development'], formats: BOTH },
  { specifier: '@sentry/cloudflare/request', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/cloudflare/orchestrion-diagnostics-channel', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/deno/import', conditions: ['deno', 'node'], formats: ESM },

  { specifier: '@sentry/nextjs', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nextjs', conditions: ['edge-light'], formats: BOTH },
  { specifier: '@sentry/nextjs', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/nextjs/cloudflare', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/nextjs/import', conditions: NODE, formats: ESM },
  { specifier: '@sentry/nextjs/tunnel', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nextjs/tunnel', conditions: ['edge-light'], formats: BOTH },
  { specifier: '@sentry/nextjs/async-storage-shim', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nextjs/orchestrion-runtime/index', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nextjs/orchestrion-runtime/register', conditions: NODE, formats: BOTH },

  { specifier: '@sentry/nuxt', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nuxt/module/plugins', conditions: NODE, formats: ESM },

  { specifier: '@sentry/sveltekit', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/sveltekit', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/sveltekit', conditions: ['worker'], formats: BOTH },
  { specifier: '@sentry/sveltekit/opentelemetry-api', conditions: NODE, formats: BOTH },

  { specifier: '@sentry/astro', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/astro/middleware', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/astro/import', conditions: NODE, formats: ESM },

  { specifier: '@sentry/react-router', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/react-router', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/react-router/cloudflare', conditions: WORKERD, formats: BOTH },

  { specifier: '@sentry/remix', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/remix', conditions: ['worker'], formats: BOTH },
  { specifier: '@sentry/remix/cloudflare', conditions: WORKERD, formats: BOTH },
  { specifier: '@sentry/remix/import', conditions: NODE, formats: ESM },
  { specifier: '@sentry/remix/v3', conditions: NODE, formats: ESM },
  { specifier: '@sentry/remix/v3/node', conditions: NODE, formats: ESM },

  { specifier: '@sentry/solidstart', conditions: NODE, formats: BOTH },

  { specifier: '@sentry/tanstackstart-react', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/tanstackstart-react/import', conditions: NODE, formats: ESM },
];

/**
 * Build-time entries must reach build-time tooling. If one does not, then
 * `BUILD_TIME_PATTERNS` no longer matches the tooling that we use.
 */
const BUILD_TIME_CASES: Case[] = [
  { specifier: '@sentry/node/vite', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/node/rollup', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/node/webpack', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/node/esbuild', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/bun/plugin', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/cloudflare/vite', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nextjs/config', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/nuxt/module', conditions: NODE, formats: ESM },
  { specifier: '@sentry/sveltekit/vite', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/react-router/vite', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/remix/vite', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/solidstart/vite', conditions: NODE, formats: BOTH },
  { specifier: '@sentry/tanstackstart-react/vite', conditions: NODE, formats: BOTH },
];

/** Browser entries of the packages above. This test does not check them. */
const CLIENT_ENTRIES = new Set([
  '@sentry/sveltekit/browser-tracing-variant',
  '@sentry/remix/v3/client',
  '@sentry/solidstart/solidrouter',
]);

function writeFixture(specifier: string, conditions: string[], format: Format): string {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const name = `${specifier.replace(/[@/]/g, '_')}-${conditions.join('_')}.${format === 'esm' ? 'mjs' : 'cjs'}`;
  const file = path.join(FIXTURE_DIR, name);
  fs.writeFileSync(file, format === 'esm' ? `import '${specifier}';\n` : `require('${specifier}');\n`);
  return file;
}

function isBuildTime(file: string): boolean {
  return BUILD_TIME_PATTERNS.some(pattern => pattern.test(file));
}

type Reasons = Awaited<ReturnType<typeof nodeFileTrace>>['reasons'];

// Most entries share `@sentry/node` and its dependencies, so sharing the
// file and analysis cache saves most of the work.
const traceCache = {};

/** The shortest import chain from `entry` to `file`, both relative to `ROOT_DIR`. */
function importChain(reasons: Reasons, entry: string, file: string): string[] {
  const importedBy = new Map<string, string>([[file, file]]);
  const queue = [file];
  while (queue.length) {
    const current = queue.shift() as string;
    if (current === entry) {
      const chain = [current];
      for (let link = current; link !== file;) {
        link = importedBy.get(link) as string;
        chain.push(link);
      }
      return chain;
    }
    for (const parent of reasons.get(current)?.parents ?? []) {
      if (!importedBy.has(parent)) {
        importedBy.set(parent, current);
        queue.push(parent);
      }
    }
  }
  return [file];
}

/**
 * Each place where a runtime module imports a build-time module, as the
 * import chain from the entry.
 */
async function findBuildTimeImports(fixture: string, conditions: string[]): Promise<string[]> {
  const imports: [importer: string, file: string][] = [];

  const { fileList, reasons } = await nodeFileTrace([fixture], {
    base: ROOT_DIR,
    conditions,
    cache: traceCache,
    // A dynamic `fs` path in config code makes nft glob the whole repo.
    // That is slow and finds user files, not package code.
    analysis: { emitGlobs: false },
    // Stop at the first build-time module, instead of tracing all of Vite
    // or Babel. `.wasm` files are assets, so they stay in the trace with
    // their importer.
    ignore: file => isBuildTime(file) && !file.endsWith('.wasm'),
    async resolve(id, parent, job, cjsResolve) {
      const resolved = await resolve(id, parent, job, cjsResolve);
      for (const file of [resolved].flat()) {
        if (isBuildTime(file)) {
          imports.push([path.relative(ROOT_DIR, parent), path.relative(ROOT_DIR, file)]);
        }
      }
      return resolved;
    },
  });

  for (const file of fileList) {
    if (file.endsWith('.wasm')) {
      for (const parent of reasons.get(file)?.parents ?? []) {
        imports.push([parent, file]);
      }
    }
  }

  const entry = path.relative(ROOT_DIR, fixture);
  const violations = imports.map(([importer, file]) =>
    importChain(reasons, entry, importer).concat(file).join('\n  -> '),
  );
  return [...new Set(violations)].sort();
}

describe('server runtime entries do not reach build-time tooling', () => {
  for (const { specifier, conditions, formats } of CASES) {
    for (const format of formats) {
      const name = `${specifier} (${format}, conditions: ${conditions.join(', ')})`;

      if (KNOWN_VIOLATIONS.has(specifier)) {
        test(`${name} is a known violation`, async () => {
          const violations = await findBuildTimeImports(writeFixture(specifier, conditions, format), conditions);
          // Remove the entry from KNOWN_VIOLATIONS when this fails.
          expect(violations).not.toEqual([]);
        });
      } else {
        test(name, async () => {
          const violations = await findBuildTimeImports(writeFixture(specifier, conditions, format), conditions);
          expect(violations).toEqual([]);
        });
      }
    }
  }
});

describe('build-time entries reach build-time tooling', () => {
  for (const { specifier, conditions, formats } of BUILD_TIME_CASES) {
    for (const format of formats) {
      test(`${specifier} (${format}, conditions: ${conditions.join(', ')})`, async () => {
        const violations = await findBuildTimeImports(writeFixture(specifier, conditions, format), conditions);
        expect(violations).not.toEqual([]);
      });
    }
  }
});

test('every export of a tested package is classified', () => {
  const classified = new Set([...CASES, ...BUILD_TIME_CASES].map(({ specifier }) => specifier));
  for (const specifier of CLIENT_ENTRIES) {
    classified.add(specifier);
  }
  const packages = new Set([...classified].map(specifier => specifier.split('/').slice(0, 2).join('/')));

  const unclassified: string[] = [];
  for (const pkg of packages) {
    const manifest = path.join(ROOT_DIR, 'packages', pkg.replace('@sentry/', ''), 'package.json');
    const { exports } = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { exports: Record<string, unknown> };
    for (const subpath of Object.keys(exports)) {
      if (subpath === './package.json') {
        continue;
      }
      const specifier = pkg + subpath.slice(1);
      const [prefix, suffix] = specifier.split('*');
      const found =
        suffix === undefined
          ? classified.has(specifier)
          : [...classified].some(s => s.startsWith(prefix as string) && s.endsWith(suffix));
      if (!found) {
        unclassified.push(specifier);
      }
    }
  }
  // Add each one to CASES, BUILD_TIME_CASES, or CLIENT_ENTRIES.
  expect(unclassified).toEqual([]);
});
