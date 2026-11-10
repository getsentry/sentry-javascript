import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createSentryBuildPluginManager } from '../../src/core/build-plugin-manager';

const { mockSourcemapUpload } = vi.hoisted(() => ({ mockSourcemapUpload: vi.fn() }));

vi.mock('sentry', () => ({
  createSentrySDK: () => ({
    release: { create: vi.fn(), finalize: vi.fn(), 'set-commits': vi.fn(), deploy: vi.fn() },
    sourcemap: { upload: mockSourcemapUpload, inject: vi.fn() },
    run: vi.fn(),
  }),
}));

vi.mock('../../src/core/sentry/telemetry', async () => ({
  ...(await vi.importActual('../../src/core/sentry/telemetry')),
  safeFlushTelemetry: vi.fn(),
}));

const DEBUG_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_DEBUG_ID = '11111111-2222-3333-4444-555555555555';

function chunk(debugId: string): string {
  return `console.log(1);\n;!function(){try{var e={},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(e){}}();`;
}

const MAP = JSON.stringify({ version: 3, sources: ['/abs/src/index.ts'], mappings: 'AAAA' });

function createManager(rewriteSources?: (source: string) => string) {
  return createSentryBuildPluginManager(
    {
      authToken: 't',
      org: 'o',
      project: 'p',
      release: { name: 'r', create: false, finalize: false },
      telemetry: false,
      sourcemaps: { rewriteSources },
    },
    { buildTool: 'rollup', loggerPrefix: '[test]' },
  );
}

describe('createUploadStaging', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSourcemapUpload.mockResolvedValue(undefined);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-staging-test-'));
  });

  afterEach(() => {
    delete process.env['SENTRY_TEST_OVERRIDE_TEMP_DIR'];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the stamped chunk and map into the staging folder', async () => {
    const manager = createManager(source => path.basename(source));
    const staging = await manager.createUploadStaging();

    try {
      const result = await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out',
        chunkPath: path.join('/out', 'index.js'),
      });

      expect(result).toBe('staged');
      expect(staging.count).toBe(1);
      expect(fs.readdirSync(staging.dir).sort()).toEqual([`${DEBUG_ID}-0.js`, `${DEBUG_ID}-0.js.map`]);
      expect(fs.readFileSync(path.join(staging.dir, `${DEBUG_ID}-0.js`), 'utf8')).toContain(`//# debugId=${DEBUG_ID}`);

      const map = JSON.parse(fs.readFileSync(path.join(staging.dir, `${DEBUG_ID}-0.js.map`), 'utf8'));
      expect(map).toMatchObject({ debug_id: DEBUG_ID, debugId: DEBUG_ID, sources: ['index.ts'] });
    } finally {
      await staging.discard();
    }
  });

  it('passes the map directory to the rewriteSources hook', async () => {
    const rewriteSources = vi.fn((source: string) => source);
    const manager = createManager(rewriteSources);
    const staging = await manager.createUploadStaging();

    try {
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out/assets',
        chunkPath: path.join('/out/assets', 'a.js'),
      });
    } finally {
      await staging.discard();
    }

    expect(rewriteSources).toHaveBeenCalledWith('/abs/src/index.ts', expect.any(Object), { mapDir: '/out/assets' });
  });

  it('skips chunks without a debug ID or without a source map and does not count them', async () => {
    const manager = createManager();
    const staging = await manager.createUploadStaging();

    try {
      expect(
        await staging.stage({
          code: 'console.log(1)',
          mapSource: MAP,
          mapDir: '/out',
          chunkPath: path.join('/out', 'a.js'),
        }),
      ).toBe('skipped');
      expect(
        await staging.stage({
          code: chunk(DEBUG_ID),
          mapSource: undefined,
          mapDir: '/out',
          chunkPath: path.join('/out', 'b.js'),
        }),
      ).toBe('skipped');
      expect(staging.count).toBe(0);
      expect(fs.readdirSync(staging.dir)).toEqual([]);
    } finally {
      await staging.discard();
    }
  });

  it('does not stage chunks excluded by `sourcemaps.ignore` and leaves them uncounted', async () => {
    const manager = createSentryBuildPluginManager(
      {
        authToken: 't',
        org: 'o',
        project: 'p',
        release: { name: 'r', create: false, finalize: false },
        telemetry: false,
        sourcemaps: { ignore: ['**/vendor.js'] },
      },
      { buildTool: 'rollup', loggerPrefix: '[test]' },
    );
    const staging = await manager.createUploadStaging();

    await expect(
      staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: tmpDir,
        chunkPath: path.join(tmpDir, 'vendor.js'),
      }),
    ).resolves.toBe('excluded');
    await expect(
      staging.stage({
        code: chunk(OTHER_DEBUG_ID),
        mapSource: MAP,
        mapDir: tmpDir,
        chunkPath: path.join(tmpDir, 'main.js'),
      }),
    ).resolves.toBe('staged');

    expect(staging.count).toBe(1);
    expect(staging.stagedChunkPaths.has(path.join(tmpDir, 'vendor.js'))).toBe(false);
    expect(fs.readdirSync(staging.dir).sort()).toEqual([`${OTHER_DEBUG_ID}-0.js`, `${OTHER_DEBUG_ID}-0.js.map`]);
    await staging.discard();
  });

  it('removes the folder on discard', async () => {
    const manager = createManager();
    const staging = await manager.createUploadStaging();

    await staging.stage({
      code: chunk(DEBUG_ID),
      mapSource: MAP,
      mapDir: '/out',
      chunkPath: path.join('/out', 'a.js'),
    });
    await staging.discard();
    await staging.discard();

    expect(fs.existsSync(staging.dir)).toBe(false);
  });

  it('keeps the folder on discard when SENTRY_TEST_OVERRIDE_TEMP_DIR is set', async () => {
    process.env['SENTRY_TEST_OVERRIDE_TEMP_DIR'] = tmpDir;
    const manager = createManager();
    const staging = await manager.createUploadStaging();

    expect(staging.dir).toBe(tmpDir);
    await staging.discard();

    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it('keeps the folder and logs its path on keep', async () => {
    const manager = createManager();
    const errorSpy = vi.spyOn(manager.logger, 'error');
    const staging = await manager.createUploadStaging();
    await staging.stage({
      code: chunk(DEBUG_ID),
      mapSource: MAP,
      mapDir: '/out',
      chunkPath: path.join('/out', 'a.js'),
    });

    try {
      await staging.keep('The upload did not run.');
      await staging.keep('The upload did not run.');
      await staging.discard();

      expect(fs.existsSync(staging.dir)).toBe(true);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        `The upload did not run. The source maps were kept in ${staging.dir}. Upload them with \`sentry sourcemap upload ${staging.dir}\`.`,
      );
    } finally {
      fs.rmSync(staging.dir, { recursive: true, force: true });
    }
  });

  it('removes the folder on keep when nothing was staged', async () => {
    const manager = createManager();
    const errorSpy = vi.spyOn(manager.logger, 'error');
    const staging = await manager.createUploadStaging();

    await staging.keep('The upload did not run.');

    expect(fs.existsSync(staging.dir)).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  describe('uploadSourcemaps with a staging folder', () => {
    it('uploads the staging folder and removes it afterwards', async () => {
      const manager = createManager();
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out',
        chunkPath: path.join('/out', 'a.js'),
      });

      const result = await manager.uploadSourcemaps([], { staging });

      expect(result).toEqual({ uploaded: true });
      expect(mockSourcemapUpload).toHaveBeenCalledWith(expect.objectContaining({ directory: staging.dir }));
      expect(fs.existsSync(staging.dir)).toBe(false);
    });

    it('does not prepare a staged chunk again from disk', async () => {
      fs.writeFileSync(path.join(tmpDir, 'index.js'), chunk(DEBUG_ID));
      fs.writeFileSync(
        path.join(tmpDir, 'index.js.map'),
        JSON.stringify({ version: 3, sources: ['stale.ts'], mappings: '' }),
      );
      const manager = createManager();
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: tmpDir,
        chunkPath: path.join(tmpDir, 'index.js'),
      });

      let uploadedFiles: string[] = [];
      let uploadedMaps = '';
      mockSourcemapUpload.mockImplementation(async ({ directory }: { directory: string }) => {
        uploadedFiles = fs.readdirSync(directory).sort();
        uploadedMaps = uploadedFiles
          .filter(file => file.endsWith('.map'))
          .map(file => fs.readFileSync(path.join(directory, file), 'utf8'))
          .join();
      });

      const result = await manager.uploadSourcemaps([path.join(tmpDir, '**/*.js')], { staging });

      expect(result).toEqual({ uploaded: true });
      expect(uploadedFiles).toEqual([`${DEBUG_ID}-0.js`, `${DEBUG_ID}-0.js.map`]);
      expect(uploadedMaps).not.toContain('stale.ts');
    });

    it('numbers artifacts prepared from disk after the staged ones', async () => {
      const outDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outDir);
      fs.writeFileSync(path.join(outDir, 'disk.js'), `${chunk(OTHER_DEBUG_ID)}\n//# sourceMappingURL=disk.js.map`);
      fs.writeFileSync(path.join(outDir, 'disk.js.map'), MAP);

      const manager = createManager();
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: outDir,
        chunkPath: path.join(outDir, 'staged.js'),
      });

      let uploadedFiles: string[] = [];
      mockSourcemapUpload.mockImplementation(async ({ directory }: { directory: string }) => {
        uploadedFiles = fs.readdirSync(directory).sort();
      });

      await manager.uploadSourcemaps([path.join(outDir, 'disk.js')], { staging });

      expect(uploadedFiles).toEqual([
        `${OTHER_DEBUG_ID}-1.js`,
        `${OTHER_DEBUG_ID}-1.js.map`,
        `${DEBUG_ID}-0.js`,
        `${DEBUG_ID}-0.js.map`,
      ]);
    });

    it('does not warn about missing sources when artifacts were staged', async () => {
      const manager = createManager();
      const warnSpy = vi.spyOn(manager.logger, 'warn');
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out',
        chunkPath: path.join('/out', 'a.js'),
      });

      await manager.uploadSourcemaps([], { staging });

      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    });

    it('discards an empty staging folder and warns when nothing matched on disk', async () => {
      const manager = createManager();
      const warnSpy = vi.spyOn(manager.logger, 'warn');
      const staging = await manager.createUploadStaging();

      const result = await manager.uploadSourcemaps([], { staging });

      expect(result).toEqual({ uploaded: false });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/matching sources/));
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
      expect(fs.existsSync(staging.dir)).toBe(false);
    });

    it('discards the staging folder when the upload cannot run', async () => {
      const manager = createSentryBuildPluginManager(
        { org: 'o', project: 'p', release: { name: 'r' }, telemetry: false },
        { buildTool: 'rollup', loggerPrefix: '[test]' },
      );
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out',
        chunkPath: path.join('/out', 'a.js'),
      });

      const result = await manager.uploadSourcemaps([], { staging });

      expect(result).toEqual({ uploaded: false });
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
      expect(fs.existsSync(staging.dir)).toBe(false);
    });

    it('keeps the staging folder and logs its path when the upload fails', async () => {
      mockSourcemapUpload.mockRejectedValue(new Error('upload failed'));
      const manager = createManager();
      const errorSpy = vi.spyOn(manager.logger, 'error');
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out',
        chunkPath: path.join('/out', 'a.js'),
      });

      try {
        const result = await manager.uploadSourcemaps([], { staging });

        expect(result).toEqual({ uploaded: false });
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(`sentry sourcemap upload ${staging.dir}`));
        expect(fs.existsSync(staging.dir)).toBe(true);
      } finally {
        await staging.discard();
      }
    });

    it('uploads the staging folder next to the direct paths when prepareArtifacts is false', async () => {
      const manager = createManager();
      const staging = await manager.createUploadStaging();
      await staging.stage({
        code: chunk(DEBUG_ID),
        mapSource: MAP,
        mapDir: '/out',
        chunkPath: path.join('/out', 'a.js'),
      });

      const result = await manager.uploadSourcemaps(['.next/server'], { staging, prepareArtifacts: false });

      expect(result).toEqual({ uploaded: true });
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(2);
      expect(mockSourcemapUpload).toHaveBeenCalledWith(expect.objectContaining({ directory: '.next/server' }));
      expect(mockSourcemapUpload).toHaveBeenCalledWith(expect.objectContaining({ directory: staging.dir }));
      expect(fs.existsSync(staging.dir)).toBe(false);
    });

    it('skips an empty staging folder when prepareArtifacts is false', async () => {
      const manager = createManager();
      const staging = await manager.createUploadStaging();

      await manager.uploadSourcemaps(['.next/server'], { staging, prepareArtifacts: false });

      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
      expect(mockSourcemapUpload).toHaveBeenCalledWith(expect.objectContaining({ directory: '.next/server' }));
      expect(fs.existsSync(staging.dir)).toBe(false);
    });

    it('reports no upload when there is nothing to upload and prepareArtifacts is false', async () => {
      const manager = createManager();
      const warnSpy = vi.spyOn(manager.logger, 'warn');

      const result = await manager.uploadSourcemaps([], { prepareArtifacts: false });

      expect(result).toEqual({ uploaded: false });
      expect(mockSourcemapUpload).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Didn't find any matching sources"));
    });
  });
});

describe('sourceMaps', () => {
  afterEach(() => {
    delete process.env['NODE_ENV'];
  });

  it('reports that an upload is possible with credentials', () => {
    expect(createManager().sourceMaps.uploadPossible).toBe(true);
  });

  it.each([
    ['no auth token', { org: 'o', project: 'p' }],
    ['no project', { org: 'o', authToken: 't' }],
    ['upload disabled', { org: 'o', project: 'p', authToken: 't', sourcemaps: { disable: true as const } }],
    ['an empty assets list', { org: 'o', project: 'p', authToken: 't', sourcemaps: { assets: [] } }],
  ])('reports that no upload is possible with %s', (_, options) => {
    const manager = createSentryBuildPluginManager(
      { ...options, release: { name: 'r' }, telemetry: false },
      { buildTool: 'rollup', loggerPrefix: '[test]' },
    );

    expect(manager.sourceMaps.uploadPossible).toBe(false);
    expect(manager.sourceMaps.decide('unset')).toEqual({ enableHidden: false, deleteAfterUpload: false });
  });

  it('reports that no upload is possible in development mode', () => {
    process.env['NODE_ENV'] = 'development';

    expect(createManager().sourceMaps.uploadPossible).toBe(false);
  });

  it('logs the decision message once', () => {
    const manager = createManager();
    const infoSpy = vi.spyOn(manager.logger, 'info');
    const { decide } = manager.sourceMaps;

    expect(decide('unset')).toMatchObject({ enableHidden: true, deleteAfterUpload: true });
    expect(decide('unset')).toMatchObject({ enableHidden: true, deleteAfterUpload: true });

    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('is inert on a disabled plugin', async () => {
    const manager = createSentryBuildPluginManager(
      { disable: true, org: 'o', project: 'p', authToken: 't' },
      { buildTool: 'rollup', loggerPrefix: '[test]' },
    );

    expect(manager.sourceMaps.uploadPossible).toBe(false);
    expect(manager.sourceMaps.decide('unset')).toEqual({ enableHidden: false, deleteAfterUpload: false });

    const staging = await manager.createUploadStaging();
    expect(await staging.stage({ code: '', mapSource: undefined, mapDir: '', chunkPath: 'a.js' })).toBe('skipped');
    expect(await manager.uploadSourcemaps([], { staging })).toEqual({ uploaded: false });
  });
});
