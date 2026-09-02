import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const nodeRequire = createRequire(import.meta.url);

/**
 * The bundler entries must load in Node even when a `document` global exists, as under
 * jsdom/happy-dom: the vendored code must never treat `document` as proof of a browser.
 * Runs against `build/cjs` because that guard lives in the emitted code, not the sources
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
      expect(() => nodeRequire(resolve(__dirname, '../../build/cjs/orchestrion/bundler', `${entry}.js`))).not.toThrow();
    },
  );
});
