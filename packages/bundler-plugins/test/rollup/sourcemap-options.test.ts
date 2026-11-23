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

const noAuthToken: Options = { ...credentials, authToken: undefined };

describe.each([
  ['rollup', rollup],
  ['rolldown', rolldown],
])('sourcemaps.upload, sourcemaps.injectDebugIds and sourcemaps.delete (%s)', (_, bundle) => {
  let tmpDir: string;
  let entry: string;
  let outDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rollup-sourcemap-options-'));
    entry = path.join(tmpDir, 'entry.js');
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function build(options: Options, sourcemap?: boolean | 'hidden'): Promise<{ files: string[]; chunk: string }> {
    const result = await bundle({ input: entry, plugins: [sentryRollupPlugin(options)] });
    await result.write({ dir: outDir, sourcemap });
    return { files: fs.readdirSync(outDir).sort(), chunk: fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8') };
  }

  function expectStampedMap(chunk: string): void {
    const debugId = chunk.match(DEBUG_ID_MARKER)?.[1];
    expect(debugId).toBeDefined();
    expect(chunk).toContain(`//# debugId=${debugId}`);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'))).toMatchObject({
      debug_id: debugId,
    });
  }

  describe('upload: false', () => {
    it('injects debug IDs, stamps the source maps the user enabled and uploads nothing', async () => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { upload: false } }, true);

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expectStampedMap(chunk);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns no source maps on', async () => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { upload: false } });

      expect(files).toEqual(['entry.js']);
      expect(chunk).toMatch(DEBUG_ID_MARKER);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns hidden source maps on and keeps them stamped with `delete: false`', async () => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { upload: false, delete: false } });

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(chunk).not.toContain('sourceMappingURL');
      expectStampedMap(chunk);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('removes the source maps the user enabled with `delete: true`', async () => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { upload: false, delete: true } }, true);

      expect(files).toEqual(['entry.js']);
      expect(chunk).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('wins over `sourcemaps.disable: true`', async () => {
      const { chunk } = await build({ ...credentials, sourcemaps: { upload: false, disable: true } }, true);

      expectStampedMap(chunk);
    });
  });

  describe('injectDebugIds: false', () => {
    it('injects no debug IDs, uploads nothing and leaves the source maps alone', async () => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { injectDebugIds: false } }, true);

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(chunk).not.toMatch(DEBUG_ID_MARKER);
      expect(chunk).not.toContain('//# debugId=');
      expect(JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'))).not.toHaveProperty('debug_id');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns no source maps on, also with `delete: false`', async () => {
      const { files } = await build({ ...credentials, sourcemaps: { injectDebugIds: false, delete: false } });

      expect(files).toEqual(['entry.js']);
    });
  });

  describe('delete: true', () => {
    it.each([true, 'hidden'] as const)('uploads and removes source maps the user enabled (%s)', async sourcemap => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { delete: true } }, sourcemap);

      expect(files).toEqual(['entry.js']);
      expect(chunk).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('removes source maps the user enabled when no upload can run', async () => {
      const { files, chunk } = await build({ ...noAuthToken, sourcemaps: { delete: true } }, true);

      expect(files).toEqual(['entry.js']);
      expect(chunk).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('removes the source maps when the upload fails', async () => {
      mockSourcemapUpload.mockRejectedValue(new Error('upload failed'));

      const { files } = await build(
        { ...credentials, errorHandler: () => undefined, sourcemaps: { delete: true } },
        'hidden',
      );

      expect(files).toEqual(['entry.js']);
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete: false', () => {
    it('turns hidden source maps on, uploads them and keeps them', async () => {
      const { files, chunk } = await build({ ...credentials, sourcemaps: { delete: false } });

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(chunk).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('turns hidden source maps on and keeps them when no upload can run', async () => {
      const { files, chunk } = await build({ ...noAuthToken, sourcemaps: { delete: false } });

      expect(files).toEqual(['entry.js', 'entry.js.map']);
      expect(chunk).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('wins over `deleteSourcemapsAfterUpload: true`', async () => {
      const { files } = await build(
        { ...credentials, sourcemaps: { delete: false, deleteSourcemapsAfterUpload: true } },
        true,
      );

      expect(files).toEqual(['entry.js', 'entry.js.map']);
    });
  });
});
