// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findServerInstrumentationFile, makeServerInstrumentationPlugin } from '../../src/vite/serverInstrumentation';

const NITRO_PLUGIN_ID = '#sentry/tanstackstart-server-instrumentation';
const APP_PLUGIN = './server/plugins/app.ts';

describe('server instrumentation', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-tanstackstart-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeFile(relativePath: string): string {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    return file;
  }

  /** Runs the Nitro module like `nitro/vite` does, and returns the Nitro options it changed. */
  function setup({ dev = false, node = true, preset = 'node-server' } = {}) {
    const nitro = { options: { dev, node, preset, rootDir: root, plugins: [APP_PLUGIN], virtual: {} } };
    makeServerInstrumentationPlugin({}).nitro.setup(nitro);
    return nitro.options;
  }

  describe('findServerInstrumentationFile', () => {
    it('finds the file in the root before the one in `src/`', () => {
      writeFile('src/instrument.server.ts');
      const rootFile = writeFile('instrument.server.mjs');

      expect(findServerInstrumentationFile(root)).toBe(rootFile);
    });

    it('finds the file in `src/`', () => {
      const srcFile = writeFile('src/instrument.server.ts');

      expect(findServerInstrumentationFile(root)).toBe(srcFile);
    });

    it('returns undefined without a server instrumentation file', () => {
      writeFile('src/instrument.client.ts');

      expect(findServerInstrumentationFile(root)).toBeUndefined();
    });
  });

  describe('Nitro module', () => {
    it('loads the file from a Nitro plugin that runs before the plugins of the app', () => {
      const file = writeFile('instrument.server.mjs');

      const { plugins, virtual } = setup();

      expect(plugins).toEqual([NITRO_PLUGIN_ID, APP_PLUGIN]);
      expect(virtual).toEqual({ [NITRO_PLUGIN_ID]: `import ${JSON.stringify(file)};\nexport default () => {};\n` });
    });

    it('adds no plugin without a server instrumentation file', () => {
      const { plugins, virtual } = setup();

      expect(plugins).toEqual([APP_PLUGIN]);
      expect(virtual).toEqual({});
    });

    it.each([
      { label: 'Nitro dev', nitro: { dev: true } },
      { label: 'a Cloudflare preset', nitro: { preset: 'cloudflare-module' } },
      { label: 'a Cloudflare preset with underscores', nitro: { preset: 'cloudflare_pages' } },
      { label: 'a preset without Node.js', nitro: { node: false, preset: 'vercel-edge' } },
    ])('adds no plugin with $label', ({ nitro }) => {
      writeFile('instrument.server.mjs');

      const { plugins, virtual } = setup(nitro);

      expect(plugins).toEqual([APP_PLUGIN]);
      expect(virtual).toEqual({});
    });
  });
});
