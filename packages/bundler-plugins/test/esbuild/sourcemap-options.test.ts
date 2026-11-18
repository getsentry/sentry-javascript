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

const noAuthToken: Options = { ...credentials, authToken: undefined };

describe('sourcemaps.upload, sourcemaps.injectDebugIds and sourcemaps.delete (esbuild)', () => {
  let tmpDir: string;
  let entry: string;
  let outDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-sourcemap-options-'));
    entry = path.join(tmpDir, 'entry.js');
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function build(
    options: Options,
    sourcemap?: BuildOptions['sourcemap'],
  ): Promise<{ files: string[]; bundle: string }> {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      outdir: outDir,
      absWorkingDir: tmpDir,
      plugins: [sentryEsbuildPlugin(options)],
      ...(sourcemap === undefined ? {} : { sourcemap }),
    });
    return { files: fs.readdirSync(outDir).sort(), bundle: fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8') };
  }

  function expectStampedMap(bundle: string): void {
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];
    expect(debugId).toBeDefined();
    expect(bundle).toContain(`//# debugId=${debugId}`);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'))).toMatchObject({
      debug_id: debugId,
    });
  }

  describe('upload: false', () => {
    it('injects debug IDs, stamps the source maps the user enabled and uploads nothing', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { upload: false } }, true);

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expectStampedMap(bundle);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns no source maps on', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { upload: false } });

      expect(files).toEqual(['entry.js']);
      expect(bundle).toMatch(DEBUG_ID_MARKER);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns external source maps on and keeps them stamped with `delete: false`', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { upload: false, delete: false } });

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(bundle).not.toContain('sourceMappingURL');
      expectStampedMap(bundle);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('removes the source maps the user enabled with `delete: true`', async () => {
      const { files } = await build({ ...credentials, sourcemaps: { upload: false, delete: true } }, 'external');

      expect(files).toEqual(['entry.js']);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });
  });

  describe('injectDebugIds: false', () => {
    it('injects no debug IDs, uploads nothing and leaves the source maps alone', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { injectDebugIds: false } }, true);

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(bundle).not.toMatch(DEBUG_ID_MARKER);
      expect(bundle).not.toContain('//# debugId=');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns no source maps on, also with `delete: false`', async () => {
      const { files } = await build({ ...credentials, sourcemaps: { injectDebugIds: false, delete: false } });

      expect(files).toEqual(['entry.js']);
    });
  });

  describe('delete: true', () => {
    it('uploads and removes source maps the user enabled', async () => {
      const { files } = await build({ ...credentials, sourcemaps: { delete: true } }, 'external');

      expect(files).toEqual(['entry.js']);
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('removes source maps the user enabled when no upload can run', async () => {
      const { files } = await build({ ...noAuthToken, sourcemaps: { delete: true } }, 'external');

      expect(files).toEqual(['entry.js']);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('removes the source maps when the upload fails', async () => {
      mockSourcemapUpload.mockRejectedValue(new Error('upload failed'));

      const { files } = await build(
        { ...credentials, errorHandler: () => undefined, sourcemaps: { delete: true } },
        'external',
      );

      expect(files).toEqual(['entry.js']);
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('removes the source maps when the error handler throws', async () => {
      mockSourcemapUpload.mockRejectedValue(new Error('upload failed'));

      await expect(
        build(
          {
            ...credentials,
            errorHandler: error => {
              throw error;
            },
            sourcemaps: { delete: true },
          },
          'external',
        ),
      ).rejects.toThrow();

      expect(fs.readdirSync(outDir).sort()).toEqual(['entry.js']);
    });
  });

  describe('delete: false', () => {
    it('turns external source maps on, uploads them and keeps them', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { delete: false } });

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(bundle).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('turns external source maps on and keeps them when no upload can run', async () => {
      const { files } = await build({ ...noAuthToken, sourcemaps: { delete: false } });

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });
  });
});
