import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { webpack } from 'webpack';
import type { Configuration, Stats } from 'webpack';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';
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

function run(config: Configuration): Promise<Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err || !stats || stats.hasErrors()) {
        return reject(err ?? new Error(stats?.toString() ?? 'no stats'));
      }
      resolve(stats);
    });
  });
}

describe('sourcemaps.upload, sourcemaps.injectDebugIds and sourcemaps.delete (webpack)', () => {
  let tmpDir: string;
  let outDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-webpack-sourcemap-options-'));
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(path.join(tmpDir, 'entry.js'), 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function build(
    options: Options,
    devtool?: Configuration['devtool'],
  ): Promise<{ files: string[]; bundle: string; devtool: Configuration['devtool'] }> {
    const stats = await run({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      output: { path: outDir, filename: 'bundle.js' },
      plugins: [sentryWebpackPlugin(options)],
      ...(devtool === undefined ? {} : { devtool }),
    });
    return {
      files: fs.readdirSync(outDir).sort(),
      bundle: fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8'),
      devtool: stats.compilation.options.devtool,
    };
  }

  function expectStampedMap(bundle: string): void {
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];
    expect(debugId).toBeDefined();
    expect(bundle).toContain(`//# debugId=${debugId}`);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'bundle.js.map'), 'utf8'))).toMatchObject({
      debug_id: debugId,
    });
  }

  describe('upload: false', () => {
    it('injects debug IDs, stamps the source maps the user enabled and uploads nothing', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { upload: false } }, 'source-map');

      expect(files).toEqual(['bundle.js', 'bundle.js.map']);
      expectStampedMap(bundle);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns no source maps on', async () => {
      const { files, bundle, devtool } = await build({ ...credentials, sourcemaps: { upload: false } });

      expect(devtool).toBe(false);
      expect(files).toEqual(['bundle.js']);
      expect(bundle).toMatch(DEBUG_ID_MARKER);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns hidden source maps on and keeps them stamped with `delete: false`', async () => {
      const { files, bundle, devtool } = await build({ ...credentials, sourcemaps: { upload: false, delete: false } });

      expect(devtool).toBe('hidden-source-map');
      expect(files).toEqual(['bundle.js', 'bundle.js.map']);
      expect(bundle).not.toContain('sourceMappingURL');
      expectStampedMap(bundle);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('removes the source maps the user enabled with `delete: true`', async () => {
      const { files, bundle } = await build(
        { ...credentials, sourcemaps: { upload: false, delete: true } },
        'source-map',
      );

      expect(files).toEqual(['bundle.js']);
      expect(bundle).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });
  });

  describe('injectDebugIds: false', () => {
    it('injects no debug IDs, uploads nothing and leaves the source maps alone', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { injectDebugIds: false } }, 'source-map');

      expect(files).toEqual(['bundle.js', 'bundle.js.map']);
      expect(bundle).not.toMatch(DEBUG_ID_MARKER);
      expect(bundle).not.toContain('//# debugId=');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('turns no source maps on, also with `delete: false`', async () => {
      const { files } = await build({ ...credentials, sourcemaps: { injectDebugIds: false, delete: false } });

      expect(files).toEqual(['bundle.js']);
    });
  });

  describe('delete: true', () => {
    it.each(['source-map', 'hidden-source-map'] as const)(
      'uploads and removes source maps the user enabled (%s)',
      async devtool => {
        const { files, bundle } = await build({ ...credentials, sourcemaps: { delete: true } }, devtool);

        expect(files).toEqual(['bundle.js']);
        expect(bundle).not.toContain('sourceMappingURL');
        expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
      },
    );

    it('removes source maps the user enabled when no upload can run', async () => {
      const { files, bundle } = await build({ ...noAuthToken, sourcemaps: { delete: true } }, 'source-map');

      expect(files).toEqual(['bundle.js']);
      expect(bundle).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });

    it('removes the source maps when the upload fails', async () => {
      mockSourcemapUpload.mockRejectedValue(new Error('upload failed'));

      const { files } = await build(
        { ...credentials, errorHandler: () => undefined, sourcemaps: { delete: true } },
        'hidden-source-map',
      );

      expect(files).toEqual(['bundle.js']);
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete: false', () => {
    it('turns hidden source maps on, uploads them and keeps them', async () => {
      const { files, bundle } = await build({ ...credentials, sourcemaps: { delete: false } });

      expect(files).toEqual(['bundle.js', 'bundle.js.map']);
      expect(bundle).not.toContain('sourceMappingURL');
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('turns hidden source maps on and keeps them when no upload can run', async () => {
      const { files, devtool } = await build({ ...noAuthToken, sourcemaps: { delete: false } });

      expect(devtool).toBe('hidden-source-map');
      expect(files).toEqual(['bundle.js', 'bundle.js.map']);
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
    });
  });
});
