import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import type { BuildOptions } from 'esbuild';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/esbuild';
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

describe('sourcemaps.deleteSourcemapsAfterUpload (esbuild)', () => {
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

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-delete-maps-'));
    entry = path.join(tmpDir, 'entry.js');
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function build(pluginOptions: Options = {}, overrides: BuildOptions = {}) {
    return esbuild.build({
      entryPoints: [entry],
      bundle: true,
      outdir: outDir,
      absWorkingDir: tmpDir,
      plugins: [sentryEsbuildPlugin({ ...credentials, ...pluginOptions })],
      ...overrides,
    });
  }

  function expectUploadedPair(upload: Upload, bundle: string): void {
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];
    expect(debugId).toBeDefined();
    expect(Object.keys(upload.files).sort()).toEqual([`${debugId}-0.js`, `${debugId}-0.js.map`]);
    expect(JSON.parse(upload.files[`${debugId}-0.js.map`]!)).toMatchObject({ debug_id: debugId });
    expect(fs.existsSync(upload.directory)).toBe(false);
  }

  it('enables external source maps, uploads them and deletes them when the setting is unset', async () => {
    await build();

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    const bundle = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    expect(bundle).not.toContain('sourceMappingURL');

    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, bundle);
  });

  it('switches linked source maps to external and deletes them when the option is true', async () => {
    await build({ sourcemaps: { deleteSourcemapsAfterUpload: true } }, { sourcemap: true });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).not.toContain('sourceMappingURL');
    expect(uploads).toHaveLength(1);
  });

  it('keeps external source maps the user enabled', async () => {
    await build({}, { sourcemap: 'external' });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8'));
  });

  it('keeps linked source maps when the option is unset', async () => {
    await build({}, { sourcemap: true });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).toContain('//# sourceMappingURL=entry.js.map');
  });

  it('does not enable source maps when the option is false', async () => {
    await build({ sourcemaps: { deleteSourcemapsAfterUpload: false } });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(uploads).toHaveLength(0);
  });

  it('warns when source maps are turned off', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await build({ silent: false }, { sourcemap: false });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Source map generation is turned off'));
  });

  it('warns when source maps are inlined and keeps them', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await build({ silent: false, sourcemaps: { deleteSourcemapsAfterUpload: true } }, { sourcemap: 'inline' });

    expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).toContain('sourceMappingURL=data:');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Source maps are inlined'));
  });

  it('does not enable source maps when no upload can run', async () => {
    await build({ authToken: undefined });

    expect(fs.readdirSync(outDir)).toEqual(['entry.js']);
    expect(uploads).toHaveLength(0);
  });

  it('does not delete anything when the build does not write', async () => {
    const rmSpy = vi.spyOn(fs.promises, 'rm');
    const result = await build({}, { write: false });

    expect(result.outputFiles?.map(file => path.basename(file.path)).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(rmSpy).not.toHaveBeenCalledWith(expect.stringContaining('entry.js.map'), expect.anything());
  });

  it('keeps the source maps when the upload fails', async () => {
    mockSourcemapUpload.mockRejectedValue(new Error('upload failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await build({ silent: false });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('were not uploaded'));
  });

  it('leaves "disable-upload" builds untouched', async () => {
    await build({ sourcemaps: { disable: 'disable-upload' } }, { sourcemap: true });

    expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js', 'entry.js.map']);
    expect(uploads).toHaveLength(0);
  });
});
