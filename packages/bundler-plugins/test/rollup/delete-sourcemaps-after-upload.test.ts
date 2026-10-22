import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rollup } from 'rollup';
import { rolldown } from 'rolldown';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';
import type { Options } from '../../src/core';

const { mockSourcemapUpload } = vi.hoisted(() => ({ mockSourcemapUpload: vi.fn() }));

vi.mock('sentry', () => ({
  createSentrySDK: () => ({
    release: { create: vi.fn(), finalize: vi.fn(), 'set-commits': vi.fn(), deploy: vi.fn() },
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

  it('does not enable source maps when the option is false', async () => {
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ ...credentials, sourcemaps: { deleteSourcemapsAfterUpload: false } })],
    });
    await build.write({ dir: outDir });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(uploads).toHaveLength(0);
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

  it('does not create a staging folder for generate()', async () => {
    const mkdtempSpy = vi.spyOn(fs.promises, 'mkdtemp');
    const build = await rollup({ input: entry, plugins: [sentryRollupPlugin(credentials)] });
    await build.generate({ dir: outDir });

    expect(mkdtempSpy).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
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
