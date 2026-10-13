import { createSentryBuildPluginManager, _resetDeployedReleasesForTesting } from '../../src/core/build-plugin-manager';
import fs from 'fs';
import { globFiles } from '../../src/core/glob';
import { prepareBundleForDebugIdUpload } from '../../src/core/debug-id-upload';
import type { MockedFunction } from 'vitest';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const {
  mockSdkConstructor,
  mockReleaseCreate,
  mockReleaseFinalize,
  mockReleaseSetCommits,
  mockReleaseDeploy,
  mockSourcemapUpload,
  mockSourcemapInject,
  mockRun,
} = vi.hoisted(() => ({
  mockSdkConstructor: vi.fn(),
  mockReleaseCreate: vi.fn(),
  mockReleaseFinalize: vi.fn(),
  mockReleaseSetCommits: vi.fn(),
  mockReleaseDeploy: vi.fn(),
  mockSourcemapUpload: vi.fn(),
  mockSourcemapInject: vi.fn(),
  mockRun: vi.fn(),
}));

vi.mock('sentry', () => ({
  createSentrySDK: (options: unknown) => {
    mockSdkConstructor(options);
    return {
      release: {
        create: mockReleaseCreate,
        finalize: mockReleaseFinalize,
        'set-commits': mockReleaseSetCommits,
        deploy: mockReleaseDeploy,
      },
      sourcemap: {
        upload: mockSourcemapUpload,
        inject: mockSourcemapInject,
      },
      run: mockRun,
    };
  },
}));

vi.mock('../../src/core/sentry/telemetry', async () => ({
  ...(await vi.importActual('../../src/core/sentry/telemetry')),
  safeFlushTelemetry: vi.fn(),
}));

vi.mock('@sentry/core', async () => ({
  ...(await vi.importActual('@sentry/core')),
  startSpan: vi.fn((options: unknown, callback: () => unknown) => callback()),
}));

vi.mock('../../src/core/glob');
vi.mock('../../src/core/debug-id-upload');

const mockGlobFiles = globFiles as MockedFunction<typeof globFiles>;
const mockPrepareBundleForDebugIdUpload = prepareBundleForDebugIdUpload as unknown as MockedFunction<
  typeof prepareBundleForDebugIdUpload
>;

describe('createSentryBuildPluginManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up environment variables
    delete process.env['SENTRY_LOG_LEVEL'];
  });

  describe('debug option', () => {
    it('should set SENTRY_LOG_LEVEL environment variable when debug is true', () => {
      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          debug: true,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(process.env['SENTRY_LOG_LEVEL']).toBe('debug');
    });

    it('should NOT override existing SENTRY_LOG_LEVEL even when debug is true', () => {
      // User explicitly set SENTRY_LOG_LEVEL to "info"
      process.env['SENTRY_LOG_LEVEL'] = 'info';

      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          debug: true,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      // Should respect the user's explicit setting
      expect(process.env['SENTRY_LOG_LEVEL']).toBe('info');
    });

    it('should not set SENTRY_LOG_LEVEL environment variable when debug is false', () => {
      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          debug: false,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(process.env['SENTRY_LOG_LEVEL']).toBeUndefined();
    });

    it('should not set SENTRY_LOG_LEVEL environment variable when debug is not specified', () => {
      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(process.env['SENTRY_LOG_LEVEL']).toBeUndefined();
    });

    it('should have SENTRY_LOG_LEVEL set when CLI operations are performed with debug enabled', async () => {
      mockSourcemapInject.mockImplementation(() => {
        // Verify the environment variable is set at the time the CLI is called
        expect(process.env['SENTRY_LOG_LEVEL']).toBe('debug');
        return Promise.resolve(undefined);
      });

      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          debug: true,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      // Verify it's set immediately after creation
      expect(process.env['SENTRY_LOG_LEVEL']).toBe('debug');

      // Perform a CLI operation and verify the env var is still set
      await buildPluginManager.injectDebugIds(['/path/to/bundle']);

      expect(mockSourcemapInject).toHaveBeenCalled();
    });

    it('should have SENTRY_LOG_LEVEL set during error scenarios with debug enabled', async () => {
      // Simulate CLI error
      mockSourcemapInject.mockImplementation(() => {
        // Verify the environment variable is set even when CLI encounters an error
        // This ensures the CLI won't emit the "Add --log-level=debug" warning
        expect(process.env['SENTRY_LOG_LEVEL']).toBe('debug');
        return Promise.reject(new Error('CLI error'));
      });

      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          debug: true,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      // Verify it's set before the error
      expect(process.env['SENTRY_LOG_LEVEL']).toBe('debug');

      // Perform a CLI operation that will fail
      await buildPluginManager.injectDebugIds(['/path/to/bundle']);

      // The error should have been caught, but env var should still be set
      expect(process.env['SENTRY_LOG_LEVEL']).toBe('debug');
    });

    it('should NOT have SENTRY_LOG_LEVEL set during error scenarios when debug is disabled', async () => {
      // Simulate CLI error
      mockSourcemapInject.mockImplementation(() => {
        // Verify the environment variable is NOT set
        // In this case, the CLI WOULD emit the "Add --log-level=debug" warning
        expect(process.env['SENTRY_LOG_LEVEL']).toBeUndefined();
        return Promise.reject(new Error('CLI error'));
      });

      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          debug: false,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      // Verify it's not set
      expect(process.env['SENTRY_LOG_LEVEL']).toBeUndefined();

      // Perform a CLI operation that will fail
      await buildPluginManager.injectDebugIds(['/path/to/bundle']);

      // The error should have been caught, and env var should still not be set
      expect(process.env['SENTRY_LOG_LEVEL']).toBeUndefined();
    });
  });

  describe('when disabled', () => {
    it('initializes a no-op build plugin manager', () => {
      const buildPluginManager = createSentryBuildPluginManager(
        {
          disable: true,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(buildPluginManager).toBeDefined();
      expect(buildPluginManager.logger).toBeDefined();
      expect(buildPluginManager.normalizedOptions.disable).toBe(true);
    });

    it('does not log anything to the console', () => {
      const logSpy = vi.spyOn(console, 'log');
      const infoSpy = vi.spyOn(console, 'info');
      const debugSpy = vi.spyOn(console, 'debug');
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');

      createSentryBuildPluginManager(
        {
          disable: true,
          release: {
            deploy: {
              // An empty string triggers a validation error (but satisfies the type checker)
              env: '',
            },
          },
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(logSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('uploadSourcemaps', () => {
    it('uploads in-place when prepareArtifacts is false', async () => {
      mockSourcemapUpload.mockResolvedValue(undefined);

      const manager = createSentryBuildPluginManager(
        {
          authToken: 't',
          org: 'o',
          project: 'p',
          release: { name: 'some-release-name', dist: '1' },
          sourcemaps: { assets: ['/app/dist/**/*'] },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.uploadSourcemaps(['/unused'], { prepareArtifacts: false });

      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
      expect(mockSourcemapUpload).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({
          // User-provided assets should be passed directly to CLI (no globbing)
          directory: '/app/dist/**/*',
          release: 'some-release-name',
          dist: '1',
        }),
      );
      // Should not glob when prepareArtifacts is false
      expect(mockGlobFiles).not.toHaveBeenCalled();
      expect(mockPrepareBundleForDebugIdUpload).not.toHaveBeenCalled();
    });

    it('uploads build artifact paths when prepareArtifacts is false and no assets provided', async () => {
      mockSourcemapUpload.mockResolvedValue(undefined);

      const manager = createSentryBuildPluginManager(
        {
          authToken: 't',
          org: 'o',
          project: 'p',
          release: { name: 'some-release-name', dist: '1' },
          // No assets provided
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.uploadSourcemaps(['.next', 'dist'], { prepareArtifacts: false });

      // One upload per build artifact directory
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(2);
      expect(mockSourcemapUpload).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ directory: '.next', release: 'some-release-name', dist: '1' }),
      );
      expect(mockSourcemapUpload).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ directory: 'dist', release: 'some-release-name', dist: '1' }),
      );
      expect(mockGlobFiles).not.toHaveBeenCalled();
      expect(mockPrepareBundleForDebugIdUpload).not.toHaveBeenCalled();
    });

    it('exits early when assets is an empty array', async () => {
      const manager = createSentryBuildPluginManager(
        {
          authToken: 't',
          org: 'o',
          project: 'p',
          release: { name: 'some-release-name', dist: '1' },
          sourcemaps: { assets: [] },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.uploadSourcemaps(['.next'], { prepareArtifacts: false });

      expect(mockSourcemapUpload).not.toHaveBeenCalled();
      expect(mockGlobFiles).not.toHaveBeenCalled();
      expect(mockPrepareBundleForDebugIdUpload).not.toHaveBeenCalled();
    });

    it('exits early when assets is an empty array even for default mode', async () => {
      const manager = createSentryBuildPluginManager(
        {
          authToken: 't',
          org: 'o',
          project: 'p',
          release: { name: 'some-release-name', dist: '1' },
          sourcemaps: { assets: [] },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.uploadSourcemaps(['.next']);

      expect(mockSourcemapUpload).not.toHaveBeenCalled();
      expect(mockGlobFiles).not.toHaveBeenCalled();
      expect(mockPrepareBundleForDebugIdUpload).not.toHaveBeenCalled();
    });

    it('prepares into temp folder and uploads when prepareArtifacts is true (default)', async () => {
      mockSourcemapUpload.mockResolvedValue(undefined);

      mockGlobFiles.mockResolvedValue(['/app/dist/a.js', '/app/dist/a.js.map', '/app/dist/other.txt']);

      vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/sentry-upload-xyz');
      vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['a.js', 'a.js.map'] as never);
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 10 } as fs.Stats);
      vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined as never);

      mockPrepareBundleForDebugIdUpload.mockResolvedValue(undefined);

      const manager = createSentryBuildPluginManager(
        {
          authToken: 't',
          org: 'o',
          project: 'p',
          release: { name: 'some-release-name', dist: '1' },
          sourcemaps: { assets: ['/app/dist/**/*'] },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.uploadSourcemaps(['/unused']);

      // Should call prepare for each JS chunk discovered by glob
      expect(mockPrepareBundleForDebugIdUpload).toHaveBeenCalled();
      // Should upload from the temp folder, where debug IDs are already injected
      expect(mockSourcemapUpload).toHaveBeenCalledWith({
        directory: '/tmp/sentry-upload-xyz',
        release: 'some-release-name',
        dist: '1',
        ext: undefined,
        ignore: undefined,
        ignoreFile: undefined,
        urlPrefix: undefined,
      });
    });

    // Skipping mapless chunks (so the CLI stops warning per stub chunk) must
    // not swallow the signal that source map generation is disabled.
    it('warns and skips upload when none of the matched bundles have a source map', async () => {
      mockSourcemapUpload.mockResolvedValue(undefined);

      // Bundles were found, but preparation produced no artifacts
      mockGlobFiles.mockResolvedValue(['/app/dist/a.js', '/app/dist/b.js']);

      vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/sentry-upload-empty');
      vi.spyOn(fs.promises, 'readdir').mockResolvedValue([] as never);
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 0 } as fs.Stats);
      vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined as never);

      mockPrepareBundleForDebugIdUpload.mockResolvedValue(undefined);

      const manager = createSentryBuildPluginManager(
        {
          authToken: 't',
          org: 'o',
          project: 'p',
          release: { name: 'some-release-name', dist: '1' },
          sourcemaps: { assets: ['/app/dist/**/*'] },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      const warnSpy = vi.spyOn(manager.logger, 'warn');

      await manager.uploadSourcemaps(['/unused']);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/source map generation is not enabled/);
      // Nothing to upload, so the CLI upload must be skipped entirely.
      expect(mockSourcemapUpload).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe('injectDebugIds', () => {
    it('should call the CLI inject command for each build artifact path', async () => {
      mockSourcemapInject.mockResolvedValue(undefined);

      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      const buildArtifactPaths = ['/path/to/1', '/path/to/2'];
      await buildPluginManager.injectDebugIds(buildArtifactPaths);

      expect(mockSourcemapInject).toHaveBeenCalledTimes(2);
      expect(mockSourcemapInject).toHaveBeenCalledWith({ directory: '/path/to/1', ignore: 'node_modules' });
      expect(mockSourcemapInject).toHaveBeenCalledWith({ directory: '/path/to/2', ignore: 'node_modules' });
    });

    it('should forward configured ignore globs to the inject command', async () => {
      mockSourcemapInject.mockResolvedValue(undefined);

      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          sourcemaps: { ignore: ['foo', 'bar'] },
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      await buildPluginManager.injectDebugIds(['/path/to/bundle']);

      expect(mockSourcemapInject).toHaveBeenCalledWith({ directory: '/path/to/bundle', ignore: 'foo,bar' });
    });
  });

  describe('uploadSourcemaps with multiple projects', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGlobFiles.mockResolvedValue(['/path/to/bundle.js']);
      mockPrepareBundleForDebugIdUpload.mockResolvedValue(undefined);
      mockSourcemapUpload.mockResolvedValue(undefined);

      // Mock fs operations needed for temp folder upload path. `readdir` returns a prepared artifact
      // so the upload path runs (an empty temp folder warns and skips the upload instead).
      vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/sentry-test');
      vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['bundle.js', 'bundle.js.map'] as never);
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1000 } as fs.Stats);
      vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create a CLI client per project when multiple projects configured', async () => {
      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: ['proj-a', 'proj-b', 'proj-c'],
          release: { name: 'test-release' },
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      await buildPluginManager.uploadSourcemaps(['/path/to/bundle.js']);

      const uploadProjects = mockSdkConstructor.mock.calls.map(call => (call[0] as { project?: string }).project);
      expect(uploadProjects).toContain('proj-a');
      expect(uploadProjects).toContain('proj-b');
      expect(uploadProjects).toContain('proj-c');
    });

    it('should create a CLI client for a single project', async () => {
      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'single-project',
          release: { name: 'test-release' },
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      await buildPluginManager.uploadSourcemaps(['/path/to/bundle.js']);

      expect(mockSdkConstructor).toHaveBeenCalledWith(expect.objectContaining({ project: 'single-project' }));
    });

    it('should create a CLI client per project in direct upload mode', async () => {
      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: ['proj-a', 'proj-b'],
          release: { name: 'test-release' },
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      await buildPluginManager.uploadSourcemaps(['/path/to/bundle.js'], {
        prepareArtifacts: false,
      });

      const uploadProjects = mockSdkConstructor.mock.calls.map(call => (call[0] as { project?: string }).project);
      expect(uploadProjects).toContain('proj-a');
      expect(uploadProjects).toContain('proj-b');
    });
  });

  describe('moduleMetadata callback with multiple projects', () => {
    it('should pass project as string and projects as array when multiple projects configured', () => {
      const moduleMetadataCallback = vi.fn().mockReturnValue({ custom: 'metadata' });

      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: ['proj-a', 'proj-b', 'proj-c'],
          release: { name: 'test-release' },
          moduleMetadata: moduleMetadataCallback,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(moduleMetadataCallback).toHaveBeenCalledWith({
        org: 'test-org',
        project: 'proj-a',
        projects: ['proj-a', 'proj-b', 'proj-c'],
        release: 'test-release',
      });
    });

    it('should pass project as string and projects as array with single project', () => {
      const moduleMetadataCallback = vi.fn().mockReturnValue({ custom: 'metadata' });

      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'single-project',
          release: { name: 'test-release' },
          moduleMetadata: moduleMetadataCallback,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(moduleMetadataCallback).toHaveBeenCalledWith({
        org: 'test-org',
        project: 'single-project',
        projects: ['single-project'],
        release: 'test-release',
      });
    });

    it('should pass undefined for projects when no project configured', () => {
      const moduleMetadataCallback = vi.fn().mockReturnValue({ custom: 'metadata' });

      createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          release: { name: 'test-release' },
          moduleMetadata: moduleMetadataCallback,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      expect(moduleMetadataCallback).toHaveBeenCalledWith({
        org: 'test-org',
        project: undefined,
        projects: undefined,
        release: 'test-release',
      });
    });
  });

  describe('telemetry option', () => {
    it('should not pass sentry-trace or baggage headers to the CLI client', async () => {
      mockSourcemapInject.mockResolvedValue(undefined);

      const buildPluginManager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          telemetry: false,
        },
        {
          buildTool: 'webpack',
          loggerPrefix: '[sentry-webpack-plugin]',
        },
      );

      // Trigger a CLI operation so a client is created
      await buildPluginManager.injectDebugIds(['/path/to/bundle']);

      const clientOptionsCalls = mockSdkConstructor.mock.calls;
      expect(clientOptionsCalls.length).toBeGreaterThan(0);

      for (const call of clientOptionsCalls) {
        const options = call[0] as { headers?: Record<string, string> };
        expect(options.headers).toBeUndefined();
      }
    });
  });

  describe('uploadLegacySourcemaps', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      _resetDeployedReleasesForTesting();
      mockSourcemapUpload.mockResolvedValue(undefined);
    });

    function createManagerWithLegacyUpload(uploadLegacySourcemaps: unknown) {
      return createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'test-release',
            uploadLegacySourcemaps: uploadLegacySourcemaps as string,
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );
    }

    it('forwards urlPrefix and ignoreFile from an include entry', async () => {
      const manager = createManagerWithLegacyUpload({
        paths: ['./dist'],
        urlPrefix: '~/static/js',
        ignoreFile: '.sentryignore',
      });

      await manager.createRelease();

      expect(mockSourcemapUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: './dist',
          urlPrefix: '~/static/js',
          ignoreFile: '.sentryignore',
        }),
      );
    });

    it('ignores node_modules when neither ignore nor ignoreFile is set', async () => {
      const manager = createManagerWithLegacyUpload('./dist');

      await manager.createRelease();

      expect(mockSourcemapUpload).toHaveBeenCalledWith(
        expect.objectContaining({ directory: './dist', ignore: 'node_modules' }),
      );
    });

    it('does not apply the node_modules default when an ignoreFile is set', async () => {
      const manager = createManagerWithLegacyUpload({ paths: ['./dist'], ignoreFile: '.sentryignore' });

      await manager.createRelease();

      expect(mockSourcemapUpload).toHaveBeenCalledWith(
        expect.objectContaining({ directory: './dist', ignore: undefined, ignoreFile: '.sentryignore' }),
      );
    });

    it('prefers configured ignore globs over the node_modules default', async () => {
      const manager = createManagerWithLegacyUpload({ paths: ['./dist'], ignore: ['foo', 'bar'] });

      await manager.createRelease();

      expect(mockSourcemapUpload).toHaveBeenCalledWith(expect.objectContaining({ ignore: 'foo,bar' }));
    });
  });

  describe('createRelease deploy deduplication', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      _resetDeployedReleasesForTesting();
    });

    it('should create a deploy record on the first call', async () => {
      const manager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'test-release',
            deploy: { env: 'production' },
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.createRelease();

      expect(mockReleaseDeploy).toHaveBeenCalledTimes(1);
      expect(mockReleaseDeploy).toHaveBeenCalledWith(
        expect.objectContaining({ orgVersion: 'test-release', environment: 'production' }),
      );
    });

    it('should not create duplicate deploy records when createRelease is called multiple times on the same instance', async () => {
      const manager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'test-release',
            deploy: { env: 'production' },
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.createRelease();
      await manager.createRelease();
      await manager.createRelease();

      expect(mockReleaseDeploy).toHaveBeenCalledTimes(1);
    });

    it('should not create duplicate deploy records across separate plugin instances with the same release name', async () => {
      const managerA = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'test-release',
            deploy: { env: 'production' },
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      const managerB = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'test-release',
            deploy: { env: 'production' },
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await managerA.createRelease();
      await managerB.createRelease();

      expect(mockReleaseDeploy).toHaveBeenCalledTimes(1);
    });

    it('should allow deploys for different release names', async () => {
      const managerA = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'release-1',
            deploy: { env: 'production' },
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      const managerB = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: {
            name: 'release-2',
            deploy: { env: 'production' },
          },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await managerA.createRelease();
      await managerB.createRelease();

      expect(mockReleaseDeploy).toHaveBeenCalledTimes(2);
      expect(mockReleaseDeploy).toHaveBeenCalledWith(
        expect.objectContaining({ orgVersion: 'release-1', environment: 'production' }),
      );
      expect(mockReleaseDeploy).toHaveBeenCalledWith(
        expect.objectContaining({ orgVersion: 'release-2', environment: 'production' }),
      );
    });

    it('should not create a deploy when deploy option is not set', async () => {
      const manager = createSentryBuildPluginManager(
        {
          authToken: 'test-token',
          org: 'test-org',
          project: 'test-project',
          release: { name: 'test-release' },
        },
        { buildTool: 'webpack', loggerPrefix: '[sentry-webpack-plugin]' },
      );

      await manager.createRelease();

      expect(mockReleaseDeploy).not.toHaveBeenCalled();
    });
  });
});
