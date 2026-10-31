import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rollup } from 'rollup';
import { rolldown } from 'rolldown';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';
import type { Options } from '../../src/core';

const { mockSourcemapUpload, mockReleaseCreate } = vi.hoisted(() => ({
  mockSourcemapUpload: vi.fn(),
  mockReleaseCreate: vi.fn(),
}));

vi.mock('sentry', () => ({
  createSentrySDK: () => ({
    release: { create: mockReleaseCreate, finalize: vi.fn(), 'set-commits': vi.fn(), deploy: vi.fn() },
    sourcemap: { upload: mockSourcemapUpload, inject: vi.fn() },
    run: vi.fn(),
  }),
}));

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;

const credentials: Options = {
  authToken: 't',
  org: 'o',
  project: 'p',
  release: { name: 'test-release', create: false, finalize: false },
  telemetry: false,
  silent: true,
};

type Upload = { directory: string; files: Record<string, string> };

describe('sourcemaps.deleteSourcemapsAfterUpload (rollup / rolldown)', () => {
  let tmpDir: string;
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

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rollup-delete-maps-'));
    entry = path.join(tmpDir, 'entry.js');
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function trackStagingFolders(): string[] {
    const createdFolders: string[] = [];
    const mkdtemp = fs.promises.mkdtemp;
    vi.spyOn(fs.promises, 'mkdtemp').mockImplementation(async (...args: Parameters<typeof mkdtemp>) => {
      const folder = await mkdtemp(...args);
      createdFolders.push(folder);
      return folder;
    });
    return createdFolders;
  }

  function expectUploadedPair(upload: Upload, chunk: string): void {
    const debugId = chunk.match(DEBUG_ID_MARKER)?.[1];
    expect(debugId).toBeDefined();
    expect(Object.keys(upload.files).sort()).toEqual([`${debugId}-0.js`, `${debugId}-0.js.map`]);
    expect(upload.files[`${debugId}-0.js`]).toContain(`//# debugId=${debugId}`);
    expect(JSON.parse(upload.files[`${debugId}-0.js.map`]!)).toMatchObject({ debug_id: debugId });
    expect(fs.existsSync(upload.directory)).toBe(false);
  }

  describe.each([
    ['rollup', rollup],
    ['rolldown', rolldown],
  ])('%s', (_, bundle) => {
    it('enables hidden source maps, uploads them and leaves none in the output when the setting is unset', async () => {
      const build = await bundle({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
      await build.write({ dir: outDir });

      expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
      const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
      expect(chunk).not.toContain('sourceMappingURL');

      expect(uploads).toHaveLength(1);
      expectUploadedPair(uploads[0]!, chunk);
    });

    it('stages chunks whose debug ID the bundler injects itself', async () => {
      const build = await bundle({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
      await build.write({ dir: outDir, sourcemapDebugIds: true });

      expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
      const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
      expect(chunk).toContain('//# debugId=');
      expect(uploads).toHaveLength(1);
      expectUploadedPair(uploads[0]!, chunk);
    });

    it('switches visible source maps to hidden and removes them when the option is true', async () => {
      const build = await bundle({
        input: entry,
        plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { deleteSourcemapsAfterUpload: true } })],
      });
      await build.write({ dir: outDir, sourcemap: true });

      expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
      const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
      expect(chunk).not.toContain('sourceMappingURL');

      expect(uploads).toHaveLength(1);
      expectUploadedPair(uploads[0]!, chunk);
    });
  });

  it('keeps hidden source maps the user enabled and uploads them from disk', async () => {
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await build.write({ dir: outDir, sourcemap: 'hidden' });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
  });

  it('removes hidden source maps the user enabled when the option is true', async () => {
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { deleteSourcemapsAfterUpload: true } })],
    });
    await build.write({ dir: outDir, sourcemap: 'hidden' });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(uploads).toHaveLength(1);
  });

  it('keeps visible source maps when the option is unset', async () => {
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await build.write({ dir: outDir, sourcemap: true });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).toContain('//# sourceMappingURL=entry.js.map');
  });

  it('enables hidden source maps but keeps them when the option is false', async () => {
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { deleteSourcemapsAfterUpload: false } })],
    });
    await build.write({ dir: outDir });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).not.toContain('sourceMappingURL');
    expect(uploads).toHaveLength(1);
    expect(Object.keys(uploads[0]!.files)).toHaveLength(2);
  });

  it('does not upload chunks matched by `sourcemaps.ignore` and leaves their maps in the output', async () => {
    const vendor = path.join(tmpDir, 'vendor.js');
    fs.writeFileSync(vendor, 'console.log("vendor");\n');
    const build = await rollup({
      input: [entry, vendor],
      plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { ignore: ['**/vendor.js'] } })],
    });
    await build.write({ dir: outDir });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'vendor.js', 'vendor.js.map']);
    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
    expect(Object.keys(uploads[0]!.files)).toHaveLength(2);
  });

  it('uploads only chunks matched by `sourcemaps.assets`', async () => {
    const vendor = path.join(tmpDir, 'vendor.js');
    fs.writeFileSync(vendor, 'console.log("vendor");\n');
    const build = await rollup({
      input: [entry, vendor],
      plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { assets: [path.join(outDir, 'entry.js')] } })],
    });
    await build.write({ dir: outDir });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'vendor.js', 'vendor.js.map']);
    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
    expect(Object.keys(uploads[0]!.files)).toHaveLength(2);
  });

  it('warns when source maps are turned off', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin({ ...credentials, silent: false })] });
    await build.write({ dir: outDir, sourcemap: false });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Source map generation is turned off'));
  });

  it('warns when source maps are inlined and keeps them', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const build = await rollup({
      input: entry,
      plugins: [
        sentryRollupPlugin({ ...credentials, silent: false, sourcemaps: { deleteSourcemapsAfterUpload: true } }),
      ],
    });
    await build.write({ dir: outDir, sourcemap: 'inline' });

    expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).toContain('sourceMappingURL=data:');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Source maps are inlined'));
  });

  it('does not enable source maps when no upload can run', async () => {
    const mkdtempSpy = vi.spyOn(fs.promises, 'mkdtemp');
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ ...credentials, authToken: undefined })],
    });
    await build.write({ dir: outDir });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(uploads).toHaveLength(0);
    expect(mkdtempSpy).not.toHaveBeenCalled();
  });

  it('returns no source maps from generate() and does not log or stage', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mkdtempSpy = vi.spyOn(fs.promises, 'mkdtemp');
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin({ ...credentials, silent: false })] });
    const { output } = await build.generate({ dir: outDir });

    expect(output.map(file => file.fileName)).toEqual(['entry.js']);
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('Enabling hidden source maps'));
    expect(mkdtempSpy).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it.each([
    ['visible output first', false],
    ['unset output first', true],
  ])('decides for each output when two write into one directory at once (%s)', async (_label, reversed) => {
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    const visible = { dir: outDir, format: 'es' as const, entryFileNames: '[name].mjs', sourcemap: true };
    const unset = { dir: outDir, format: 'cjs' as const, entryFileNames: '[name].cjs' };
    const outputs = reversed ? [unset, visible] : [visible, unset];
    await Promise.all(outputs.map(output => build.write(output)));

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.cjs', 'entry.mjs', 'entry.mjs.map']);
    expect(fs.readFileSync(path.join(outDir, 'entry.mjs'), 'utf8')).toContain('//# sourceMappingURL=entry.mjs.map');
    expect(fs.readFileSync(path.join(outDir, 'entry.cjs'), 'utf8')).not.toContain('sourceMappingURL');
    expect(uploads).toHaveLength(2);
    // Each upload also globs the directory, so it may carry the other output's files.
    const debugId = fs.readFileSync(path.join(outDir, 'entry.cjs'), 'utf8').match(DEBUG_ID_MARKER)?.[1];
    const staged = uploads.find(upload => `${debugId}-0.js` in upload.files);
    expect(staged?.files[`${debugId}-0.js`]).toContain(`//# debugId=${debugId}`);
    expect(JSON.parse(staged?.files[`${debugId}-0.js.map`] ?? '{}')).toMatchObject({ debug_id: debugId });
  });

  it('tells a file output apart from a dir output written into the same directory at once', async () => {
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await Promise.all([
      build.write({ dir: outDir, format: 'es' }),
      build.write({ file: path.join(outDir, 'bundle.js'), sourcemap: true }),
    ]);

    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'bundle.js.map', 'entry.js']);
    expect(uploads).toHaveLength(2);
  });

  it('tells a preserveModules output apart from a bundled one written into the same directory', async () => {
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await Promise.all([
      build.write({ dir: outDir, preserveModules: true, sourcemap: true }),
      build.write({ dir: outDir, entryFileNames: 'bundle.js' }),
    ]);

    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'entry.js', 'entry.js.map']);
    expect(uploads).toHaveLength(2);
  });

  it('passes the directory of the map file to the rewriteSources hook', async () => {
    const mapDirs: Array<string | undefined> = [];
    const build = await rollup({
      input: entry,
      plugins: [
        sentryRollupPlugin({
          ...credentials,
          sourcemaps: {
            rewriteSources: (source: string, _map: unknown, context?: { mapDir: string }) => {
              mapDirs.push(context?.mapDir);
              return source;
            },
          },
        }),
      ],
    });
    await build.write({ dir: outDir, sourcemapFileNames: 'maps/[name].js.map' });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(mapDirs).toEqual([path.join(outDir, 'maps')]);
    expect(uploads).toHaveLength(1);
  });

  it('uploads each output on its own', async () => {
    const otherOutDir = path.join(tmpDir, 'dist-other');
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await build.write({ dir: outDir });
    await build.write({ dir: otherOutDir, entryFileNames: 'other.js' });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(fs.readdirSync(otherOutDir)).toEqual(['other.js']);
    expect(uploads).toHaveLength(2);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
    expectUploadedPair(uploads[1]!, fs.readFileSync(path.join(otherOutDir, 'other.js'), 'utf8'));
  });

  it('removes the map asset before other plugins see the written bundle', async () => {
    let writtenFiles: string[] = [];
    const build = await rollup({
      input: entry,
      plugins: [
        sentryRollupPlugin(credentials),
        {
          name: 'observer',
          writeBundle(_options: unknown, bundle: Record<string, unknown>) {
            writtenFiles = Object.keys(bundle);
          },
        },
      ],
    });
    await build.write({ dir: outDir });

    expect(writtenFiles).toEqual(['entry.js']);
  });

  it('keeps the staging folder and logs its path when the release step throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const createdFolders = trackStagingFolders();
    mockReleaseCreate.mockRejectedValue(new Error('release failed'));
    const build = await rollup({
      input: entry,
      plugins: [
        sentryRollupPlugin({
          ...credentials,
          silent: false,
          release: { name: 'test-release', create: true, finalize: false },
          errorHandler: error => {
            throw error;
          },
        }),
      ],
    });

    await expect(build.write({ dir: outDir })).rejects.toThrow('release failed');

    try {
      expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
      expect(uploads).toHaveLength(0);
      expect(createdFolders).toHaveLength(1);
      expect(fs.existsSync(createdFolders[0]!)).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`sentry sourcemap upload ${createdFolders[0]}`));
    } finally {
      fs.rmSync(createdFolders[0]!, { recursive: true, force: true });
    }
  });

  it('does not upload a staging left behind by a write that never finished', async () => {
    const createdFolders = trackStagingFolders();
    const plugins = sentryRollupPlugin(credentials);
    let fail = true;
    const failingPlugin = {
      name: 'failing-post-plugin',
      generateBundle: {
        order: 'post' as const,
        handler: () => {
          if (fail) {
            throw new Error('write failed');
          }
        },
      },
    };

    const firstBuild = await rollup({ input: entry, plugins: [...plugins, failingPlugin] });
    await expect(firstBuild.write({ dir: outDir })).rejects.toThrow('write failed');

    fail = false;
    fs.writeFileSync(entry, 'export const answer = 43;\nconsole.log(answer);\n');
    const secondBuild = await rollup({ input: entry, plugins: [...plugins, failingPlugin] });
    await secondBuild.write({ dir: outDir });

    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
    expect(createdFolders).toHaveLength(2);
    expect(createdFolders.filter(folder => fs.existsSync(folder))).toEqual([]);
  });

  it('does not pair a new chunk with a stale map left in the output directory', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'entry.js.map'),
      JSON.stringify({ version: 3, sources: ['stale.ts'], mappings: '' }),
    );
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await build.write({ dir: outDir });

    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
    expect(JSON.stringify(uploads[0]!.files)).not.toContain('stale.ts');
  });

  it('uploads from disk when writeBundle is called with output options only', async () => {
    // SvelteKit defers the main plugin's writeBundle to closeBundle and calls it without a bundle.
    const [main, post] = sentryRollupPlugin({ ...credentials, sourcemaps: { deleteSourcemapsAfterUpload: false } });
    const build = await rollup({ input: entry, plugins: [{ ...main, writeBundle: undefined }, post] });
    await build.write({ dir: outDir, sourcemap: 'hidden' });
    expect(uploads).toHaveLength(0);

    await main.writeBundle({ dir: outDir });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(uploads).toHaveLength(1);
    expect(Object.keys(uploads[0]!.files)).toHaveLength(2);
  });

  it('removes the staging folder when staging a chunk fails', async () => {
    const createdFolders = trackStagingFolders();
    const writeFile = fs.promises.writeFile;
    vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (...args: Parameters<typeof writeFile>) => {
      if (String(args[0]).includes('sentry-bundler-plugin-upload-')) {
        throw new Error('disk full');
      }
      return writeFile(...args);
    });
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });

    await expect(build.write({ dir: outDir })).rejects.toThrow('disk full');

    expect(createdFolders).toHaveLength(1);
    expect(fs.existsSync(createdFolders[0]!)).toBe(false);
    expect(uploads).toHaveLength(0);
  });

  it('keeps the map of a chunk that already carries a debug ID instead of dropping it unuploaded', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const build = await rollup({
      input: entry,
      plugins: [
        {
          name: 'foreign-debug-id',
          renderChunk: (code: string) => `${code}\n//# debugId=11111111-2222-3333-4444-555555555555`,
        },
        sentryRollupPlugin({ ...credentials, silent: false }),
      ],
    });
    await build.write({ dir: outDir });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stays in the build output'));
  });

  it('leaves "disable-upload" builds untouched', async () => {
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { disable: 'disable-upload' } })],
    });
    await build.write({ dir: outDir, sourcemap: true });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(uploads).toHaveLength(0);
  });
});
