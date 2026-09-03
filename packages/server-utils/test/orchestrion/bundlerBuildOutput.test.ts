import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const BUILD_CJS_DIR = resolve(__dirname, '../../build/cjs');

// The five entries share vendored chunks, and the require cache would keep a chunk's module scope
// from running again after the first test. Drop everything under `build/cjs` first, so each test
// really executes the code it claims to.
function requireFresh(entry: string): unknown {
  for (const key of Object.keys(nodeRequire.cache)) {
    if (key.startsWith(BUILD_CJS_DIR)) {
      Reflect.deleteProperty(nodeRequire.cache, key);
    }
  }
  return nodeRequire(resolve(BUILD_CJS_DIR, 'orchestrion/bundler', `${entry}.js`));
}

/**
 * The bundler entries must load in Node even when a `document` global exists, which is the case
 * under jsdom/happy-dom: the vendored code must never treat `document` as proof of a browser.
 * Runs against `build/cjs` because that guard lives in the emitted code, not the sources.
 * Reference Issue: https://github.com/getsentry/sentry-javascript/issues/23789
 */
describe('built CJS bundler entries load under DOM test environments', () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it.each(['webpack', 'webpack-loader', 'esbuild', 'vite', 'rollup'])(
    'build/cjs/orchestrion/bundler/%s.js loads while a `document` global is defined',
    entry => {
      (globalThis as { document?: unknown }).document = { baseURI: 'http://localhost:3000/' };
      expect(() => requireFresh(entry)).not.toThrow();
    },
  );
});
