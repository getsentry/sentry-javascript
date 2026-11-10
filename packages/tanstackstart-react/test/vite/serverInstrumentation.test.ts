// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findServerInstrumentationFile, makeServerInstrumentationPlugin } from '../../src/vite/serverInstrumentation';

const NITRO_PLUGIN_ID = '#sentry/tanstackstart-server-instrumentation';

describe('server instrumentation', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-tanstackstart-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeFile(relativePath: string): string {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    return file;
  }

  function setup(
    options: Parameters<typeof makeServerInstrumentationPlugin>[0] = {},
    { dev = false, preset = 'node-server', plugins = ['./server/plugins/app.ts'] } = {},
  ) {
    const nitro = {
      options: { dev, preset, rootDir: root, plugins: [...plugins], virtual: {} as Record<string, string> },
    };
    makeServerInstrumentationPlugin(options).nitro.setup(nitro);
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
      writeFile('instrument.client.ts');

      expect(findServerInstrumentationFile(root)).toBeUndefined();
    });
  });

  describe('Nitro module', () => {
    it('loads the found file from a Nitro plugin that runs before the plugins of the app', () => {
      const file = writeFile('instrument.server.mjs');

      const { plugins, virtual } = setup();

      expect(plugins).toEqual([NITRO_PLUGIN_ID, './server/plugins/app.ts']);
      expect(virtual[NITRO_PLUGIN_ID]).toBe(`import ${JSON.stringify(file)};\nexport default () => {};\n`);
    });

    it('loads a configured file relative to the root', () => {
      const file = writeFile('config/sentry.server.ts');

      const { virtual } = setup({ serverInstrumentationFile: 'config/sentry.server.ts' });

      expect(virtual[NITRO_PLUGIN_ID]).toBe(`import ${JSON.stringify(file)};\nexport default () => {};\n`);
    });

    it('warns and adds no plugin when the configured file does not exist', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { plugins, virtual } = setup({ serverInstrumentationFile: 'missing.ts' });

      expect(plugins).toEqual(['./server/plugins/app.ts']);
      expect(virtual).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('`missing.ts`'));
    });

    it('adds no plugin without a server instrumentation file', () => {
      const { plugins, virtual } = setup();

      expect(plugins).toEqual(['./server/plugins/app.ts']);
      expect(virtual).toEqual({});
    });

    it.each([
      {
        label: '`serverInstrumentationFile: false`',
        options: { serverInstrumentationFile: false as const },
        nitro: {},
      },
      { label: 'Nitro dev', options: {}, nitro: { dev: true } },
      { label: 'a Cloudflare preset', options: {}, nitro: { preset: 'cloudflare-module' } },
      { label: 'a Cloudflare preset with underscores', options: {}, nitro: { preset: 'cloudflare_pages' } },
    ])('adds no plugin with $label', ({ options, nitro }) => {
      writeFile('instrument.server.mjs');

      const { plugins, virtual } = setup(options, nitro);

      expect(plugins).toEqual(['./server/plugins/app.ts']);
      expect(virtual).toEqual({});
    });
  });
});
