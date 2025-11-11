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
