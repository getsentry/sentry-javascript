import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { build, createBuilder } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryVitePlugin } from '../../src/vite';
import type { Options } from '../../src/core';

const { mockSourcemapUpload } = vi.hoisted(() => ({ mockSourcemapUpload: vi.fn() }));

vi.mock('sentry', () => ({
  createSentrySDK: () => ({
    release: { create: vi.fn(), finalize: vi.fn(), 'set-commits': vi.fn(), deploy: vi.fn() },
    sourcemap: { upload: mockSourcemapUpload, inject: vi.fn() },
    run: vi.fn(),
  }),
}));

const credentials: Options = {
  authToken: 't',
  org: 'o',
  project: 'p',
  release: { name: 'test-release', create: false, finalize: false },
  telemetry: false,
  silent: true,
};

type Upload = { directory: string; files: Record<string, string> };

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => fs.statSync(path.join(dir, file)).isFile());
}

function readChunks(dir: string): string[] {
  return listFiles(dir)
    .filter(file => file.endsWith('.js'))
    .map(file => fs.readFileSync(path.join(dir, file), 'utf8'));
}

describe('sourcemaps.deleteSourcemapsAfterUpload (vite)', () => {
  let root: string;
  let entry: string;
  let outDir: string;
  let uploads: Upload[];

  beforeEach(() => {
    vi.clearAllMocks();
    uploads = [];
    mockSourcemapUpload.mockImplementation(async ({ directory }: { directory: string }) => {
      const files: Record<string, string> = {};
      for (const file of fs.readdirSync(directory)) {
        files[file] = fs.readFileSync(path.join(directory, file), 'utf8');
      }
      uploads.push({ directory, files });
    });

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-vite-delete-maps-'));
    entry = path.join(root, 'main.js');
    outDir = path.join(root, 'dist');
    // A dynamic import makes Vite's import analysis regenerate the source map in `generateBundle`.
    fs.writeFileSync(entry, "import('./lazy.js').then(m => console.log(m.answer));\n");
    fs.writeFileSync(path.join(root, 'lazy.js'), 'export const answer = 42;\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function viteConfig(pluginOptions: Options, plugins: Plugin[] = []) {
    return {
      configFile: false as const,
      logLevel: 'silent' as const,
      root,
      plugins: [...sentryVitePlugin({ ...credentials, ...pluginOptions }), ...plugins],
      build: { outDir, minify: false as const, rollupOptions: { input: entry } },
    };
  }

  function expectUploadedPairs(upload: Upload, chunks: string[]): void {
    const uploadedNames = Object.keys(upload.files);
    expect(uploadedNames.filter(name => name.endsWith('.js'))).toHaveLength(chunks.length);

    for (const chunk of chunks) {
      const debugId = chunk.match(/sentry-dbid-([0-9a-f-]{36})/)?.[1];
      expect(debugId).toBeDefined();
      const mapName = uploadedNames.find(name => name.startsWith(`${debugId}-`) && name.endsWith('.map'));
      expect(mapName).toBeDefined();
      expect(JSON.parse(upload.files[mapName!]!)).toMatchObject({ debug_id: debugId });
    }

    expect(fs.existsSync(upload.directory)).toBe(false);
  }

  it('enables hidden source maps, uploads them and leaves none in the output when the setting is unset', async () => {
    let resolvedSourcemap: unknown;
    const spy: Plugin = {
      name: 'spy',
      configResolved(config: ResolvedConfig) {
        resolvedSourcemap = config.build.sourcemap;
      },
    };

    await build(viteConfig({}, [spy]));

    expect(resolvedSourcemap).toBe('hidden');
    const files = listFiles(outDir);
    expect(files.filter(file => file.endsWith('.map'))).toEqual([]);
    const chunks = readChunks(outDir);
    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk).not.toContain('sourceMappingURL');
    }

    expect(uploads).toHaveLength(1);
    expectUploadedPairs(uploads[0]!, chunks);
  });

  it('switches visible source maps to hidden and removes them when the option is true', async () => {
    const config = viteConfig({ sourcemaps: { deleteSourcemapsAfterUpload: true } });
    await build({ ...config, build: { ...config.build, sourcemap: true } });

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toEqual([]);
    const chunks = readChunks(outDir);
    for (const chunk of chunks) {
      expect(chunk).not.toContain('sourceMappingURL');
    }
    expect(uploads).toHaveLength(1);
    expectUploadedPairs(uploads[0]!, chunks);
  });

  it('stages chunks whose debug ID the bundler injects itself', async () => {
    const config = viteConfig({});
    await build({
      ...config,
      build: { ...config.build, rollupOptions: { input: entry, output: { sourcemapDebugIds: true } } },
    });

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toEqual([]);
    const chunks = readChunks(outDir);
    for (const chunk of chunks) {
      expect(chunk).toContain('//# debugId=');
    }
    expect(uploads).toHaveLength(1);
    expectUploadedPairs(uploads[0]!, chunks);
  });

  it('removes source maps from an output directory set through rollupOptions', async () => {
    const rollupOutDir = path.join(root, 'out', 'rollup');
    const config = viteConfig({});
    await build({
      ...config,
      build: { ...config.build, outDir: 'dist', rollupOptions: { input: entry, output: { dir: rollupOutDir } } },
    });

    expect(listFiles(rollupOutDir).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(uploads).toHaveLength(1);
    expectUploadedPairs(uploads[0]!, readChunks(rollupOutDir));
  });

  it('keeps source maps an output enables through rollupOptions and uploads them from disk', async () => {
    const config = viteConfig({});
    await build({
      ...config,
      build: { ...config.build, rollupOptions: { input: entry, output: { sourcemap: true } } },
    });

    const chunks = readChunks(outDir);
    expect(chunks).toHaveLength(2);
    expect(chunks.every(chunk => chunk.includes('//# sourceMappingURL='))).toBe(true);
    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toHaveLength(2);
    expect(uploads).toHaveLength(1);
    expect(Object.keys(uploads[0]!.files)).toHaveLength(4);
  });

  it('keeps hidden source maps an output enables through rollupOptions', async () => {
    const config = viteConfig({});
    await build({
      ...config,
      build: { ...config.build, rollupOptions: { input: entry, output: { sourcemap: 'hidden' } } },
    });

    const chunks = readChunks(outDir);
    expect(chunks).toHaveLength(2);
    expect(chunks.some(chunk => chunk.includes('//# sourceMappingURL='))).toBe(false);
    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toHaveLength(2);
    expect(uploads).toHaveLength(1);
    expect(Object.keys(uploads[0]!.files)).toHaveLength(4);
  });

  it('removes hidden source maps an output enables when the option is true', async () => {
    const config = viteConfig({ sourcemaps: { deleteSourcemapsAfterUpload: true } });
    await build({
      ...config,
      build: { ...config.build, rollupOptions: { input: entry, output: { sourcemap: 'hidden' } } },
    });

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(uploads).toHaveLength(1);
    expectUploadedPairs(uploads[0]!, readChunks(outDir));
  });

  it('keeps hidden source maps the user enabled and uploads them from disk', async () => {
    const config = viteConfig({});
    await build({ ...config, build: { ...config.build, sourcemap: 'hidden' } });

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toHaveLength(2);
    expect(uploads).toHaveLength(1);
    expect(Object.keys(uploads[0]!.files)).toHaveLength(4);
  });

  it('does not upload chunks matched by `sourcemaps.ignore` and leaves their maps in the output', async () => {
    const vendor = path.join(root, 'vendor.js');
    fs.writeFileSync(vendor, 'console.log("vendor");\n');
    const config = viteConfig({ sourcemaps: { ignore: ['**/vendor-*.js'] } });
    await build({ ...config, build: { ...config.build, rollupOptions: { input: [entry, vendor] } } });

    const maps = listFiles(outDir).filter(file => file.endsWith('.map'));
    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatch(/vendor-[^/]+\.js\.map$/);
    expect(uploads).toHaveLength(1);
    expectUploadedPairs(
      uploads[0]!,
      readChunks(outDir).filter(chunk => !chunk.includes('"vendor"')),
    );
  });

  it('decides for each output when two write into one directory', async () => {
    const config = viteConfig({});
    await build({
      ...config,
      build: {
        ...config.build,
        rollupOptions: {
          input: entry,
          output: [
            { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs', sourcemap: true },
            { format: 'cjs', entryFileNames: '[name].cjs', chunkFileNames: '[name].cjs' },
          ],
        },
      },
    });

    expect(listFiles(outDir).sort()).toEqual([
      'lazy.cjs',
      'lazy.mjs',
      'lazy.mjs.map',
      'main.cjs',
      'main.mjs',
      'main.mjs.map',
    ]);
    expect(uploads).toHaveLength(2);
  });

  it('forgets environment decisions of an earlier build of the same plugin instances', async () => {
    const config = viteConfig({});
    await build({ ...config, environments: { client: { build: { sourcemap: false } } } });
    expect(listFiles(outDir).some(file => file.endsWith('.map'))).toBe(false);
    expect(uploads).toHaveLength(0);

    await build(config);

    expect(listFiles(outDir).some(file => file.endsWith('.map'))).toBe(false);
    expect(uploads).toHaveLength(1);
    expectUploadedPairs(uploads[0]!, readChunks(outDir));
  });

  it('does not create a staging folder when the build does not write', async () => {
    const mkdtempSpy = vi.spyOn(fs.promises, 'mkdtemp');
    const config = viteConfig({});
    await build({ ...config, build: { ...config.build, write: false } });

    expect(mkdtempSpy).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('does not remove source maps when a later plugin turns them off', async () => {
    const later: Plugin = { name: 'later', config: () => ({ build: { sourcemap: false } }) };

    await build(viteConfig({}, [later]));

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(uploads).toHaveLength(0);
  });

  it('uploads a client build and an SSR build of the same plugin instances on their own', async () => {
    const plugins = sentryVitePlugin(credentials);
    const serverOutDir = path.join(root, 'dist-server');

    await build({ ...viteConfig({}), plugins });
    await build({
      ...viteConfig({}),
      plugins,
      build: { outDir: serverOutDir, minify: false, ssr: entry },
    });

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(listFiles(serverOutDir).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(uploads).toHaveLength(2);
  });

  it('keeps source maps in an environment that sets them itself', async () => {
    const serverOutDir = path.join(root, 'dist-server');
    const builder = await createBuilder({
      ...viteConfig({}),
      environments: {
        ssr: {
          build: { outDir: serverOutDir, minify: false, sourcemap: 'hidden', rollupOptions: { input: entry } },
        },
      },
      builder: {},
    });
    await builder.buildApp();

    expect(listFiles(outDir).filter(file => file.endsWith('.map'))).toEqual([]);
    expect(listFiles(serverOutDir).filter(file => file.endsWith('.map'))).toHaveLength(2);
    expect(uploads).toHaveLength(2);
  });

  it('still restores debug IDs for "disable-upload" builds', async () => {
    const config = viteConfig({ sourcemaps: { disable: 'disable-upload' } });
    await build({ ...config, build: { ...config.build, sourcemap: true } });

    const chunks = readChunks(outDir);
    const maps = listFiles(outDir).filter(file => file.endsWith('.map'));
    expect(maps).toHaveLength(2);
    for (const chunk of chunks) {
      const debugId = chunk.match(/sentry-dbid-([0-9a-f-]{36})/)?.[1];
      expect(debugId).toBeDefined();
      const map = maps
        .map(file => JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8')))
        .find(m => m.debug_id === debugId);
      expect(map).toBeDefined();
    }
    expect(uploads).toHaveLength(0);
  });
});
