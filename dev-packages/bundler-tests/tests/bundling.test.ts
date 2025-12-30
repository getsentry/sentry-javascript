import { describe, expect, beforeAll, test } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import webpack from 'webpack';
import { rollup } from 'rollup';
import { build as viteBuild } from 'vite';
import nodeResolve from '@rollup/plugin-node-resolve';

// Helper functions
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function distDir(name: string): string {
  const dir = path.join(__dirname, '..', 'dist', name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function rimraf(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readAllJs(outDir: string): string {
  let contents = '';
  const stack = [outDir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current)) {
      const full = path.join(current, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
        contents += fs.readFileSync(full, 'utf8');
      }
    }
  }
  return contents;
}

function fixtureEntry(name: string): string {
  return path.resolve(__dirname, '..', 'fixtures', name, 'index.js');
}

function rootDir(): string {
  return path.join(__dirname, '../../..');
}

const SPOTLIGHT_URL = 'localhost:8969';

type BundleMode = 'development' | 'production';

function bundleWithWebpack(mode: BundleMode): Promise<string> {
  return new Promise((resolve, reject) => {
    const outDir = distDir(`webpack-${mode}`);
    rimraf(outDir);
    const compiler = webpack({
      mode,
      entry: fixtureEntry('basic'),
      output: { path: outDir, filename: 'bundle.js' },
    });
    compiler?.run((err: Error | null | undefined, stats: webpack.Stats | undefined) => {
      try {
        if (err) throw err;
        if (stats?.hasErrors()) {
          throw new Error(stats.toString('errors-only'));
        }
        resolve(readAllJs(outDir));
      } catch (e) {
        reject(e);
      } finally {
        compiler.close(() => {});
      }
    });
  });
}

async function bundleWithRollup(mode: BundleMode): Promise<string> {
  const outDir = distDir(`rollup-${mode}`);
  rimraf(outDir);

  const bundle = await rollup({
    input: fixtureEntry('basic'),
    plugins: [
      nodeResolve({
        // There should really be a default where these get specified automatically
        exportConditions: [mode === 'production' ? 'production' : 'development'],
      }),
    ],
  });
  await bundle.write({ dir: outDir, format: 'esm' });
  await bundle.close();
  return readAllJs(outDir);
}

async function bundleWithVite(mode: BundleMode): Promise<string> {
  const outDir = distDir(`vite-${mode}`);
  rimraf(outDir);

  // In Vitest, NODE_ENV is always 'test', so we need to override it here
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;

  await viteBuild({
    mode,
    root: path.dirname(fixtureEntry('basic')),
    build: { outDir, minify: mode === 'production' },
  });

  process.env.NODE_ENV = prev;

  return readAllJs(outDir);
}

describe('spotlight', () => {
  beforeAll(() => {
    const distRoot = path.join(rootDir(), 'dist');
    rimraf(distRoot);
  });

  const cases: [string, (mode: BundleMode) => Promise<string>][] = [
    ['webpack', bundleWithWebpack],
    ['rollup', bundleWithRollup],
    ['vite', bundleWithVite],
  ];

  for (const [name, bundler] of cases) {
    test(`${name} development bundle contains spotlight`, async () => {
      const code = await bundler('development');
      expect(code).toContain(SPOTLIGHT_URL);
    });

    test(`${name} production bundle does not contain spotlight`, async () => {
      const code = await bundler('production');
      expect(code).not.toContain(SPOTLIGHT_URL);
    });
  }
});

describe('__VITE_SPOTLIGHT_ENV__ rollup replacement', () => {
  // Test that our rollup build correctly replaces __VITE_SPOTLIGHT_ENV__
  // ESM bundles should have import.meta.env access, CJS should have undefined

  function readSdkFile(packageName: string, format: 'esm' | 'cjs'): string {
    const sdkPath = path.join(
      rootDir(),
      'packages',
      packageName,
      'build',
      format,
      'sdk.js',
    );
    if (!fs.existsSync(sdkPath)) {
      throw new Error(`SDK file not found: ${sdkPath}. Make sure to run yarn build:dev first.`);
    }
    return fs.readFileSync(sdkPath, 'utf8');
  }

  // Remove comments from code to test only actual code
  function stripComments(code: string): string {
    // Remove single-line comments
    return code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }

  test.each(['react', 'vue', 'svelte', 'solid'] as const)(
    '%s ESM bundle contains import.meta.env?.VITE_SENTRY_SPOTLIGHT access',
    packageName => {
      const code = stripComments(readSdkFile(packageName, 'esm'));
      // ESM bundles should have import.meta.env access for Vite support
      // The replacement is: import.meta.env?.VITE_SENTRY_SPOTLIGHT
      expect(code).toMatch(/import\.meta\.env\?\.[A-Z_]+SPOTLIGHT/);
    },
  );

  test.each(['react', 'vue', 'svelte', 'solid'] as const)(
    '%s CJS bundle does not contain import.meta.env (CJS incompatible)',
    packageName => {
      const code = stripComments(readSdkFile(packageName, 'cjs'));
      // CJS bundles should NOT have import.meta.env as it's ESM-only syntax
      // The __VITE_SPOTLIGHT_ENV__ placeholder should be replaced with 'undefined'
      expect(code).not.toMatch(/import\.meta\.env/);
    },
  );
});
