import { createSentryBuildPluginManager, _resetDeployedReleasesForTesting } from '../../src/core/build-plugin-manager';
import fs from 'fs';
import { globFiles } from '../../src/core/glob';
import { prepareBundleForDebugIdUpload } from '../../src/core/debug-id-upload';
import type { MockedFunction } from 'vitest';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const { mockCliExecute, mockCliUploadSourceMaps, mockCliNewDeploy, mockCliConstructor } = vi.hoisted(() => ({
  mockCliExecute: vi.fn(),
  mockCliUploadSourceMaps: vi.fn(),
  mockCliNewDeploy: vi.fn(),
  mockCliConstructor: vi.fn(),
}));

vi.mock('@sentry/cli', () => ({
  default: class {
    constructor(...args: unknown[]) {
      mockCliConstructor(...args);
    }
    execute = mockCliExecute;
    releases = {
      uploadSourceMaps: mockCliUploadSourceMaps,
      new: vi.fn(),
      finalize: vi.fn(),
      setCommits: vi.fn(),
      newDeploy: mockCliNewDeploy,
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
      mockCliExecute.mockImplementation(() => {
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

      expect(mockCliExecute).toHaveBeenCalled();
    });

    it('should have SENTRY_LOG_LEVEL set during error scenarios with debug enabled', async () => {
      // Simulate CLI error
      mockCliExecute.mockImplementation(() => {
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
      mockCliExecute.mockImplementation(() => {
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
      mockCliUploadSourceMaps.mockResolvedValue(undefined);

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

      expect(mockCliUploadSourceMaps).toHaveBeenCalledTimes(1);
      expect(mockCliUploadSourceMaps).toHaveBeenCalledWith(
        'some-release-name',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          include: expect.arrayContaining([
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            expect.objectContaining({
              // User-provided assets should be passed directly to CLI (no globbing)
              paths: ['/app/dist/**/*'],
              rewrite: true,
              dist: '1',
            }),
          ]),
          live: 'rejectOnError',
        }),
      );
      // Should not glob when prepareArtifacts is false
      expect(mockGlobFiles).not.toHaveBeenCalled();
      expect(mockPrepareBundleForDebugIdUpload).not.toHaveBeenCalled();
    });

    it('uploads build artifact paths when prepareArtifacts is false and no assets provided', async () => {
      mockCliUploadSourceMaps.mockResolvedValue(undefined);

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

      expect(mockCliUploadSourceMaps).toHaveBeenCalledTimes(1);
      expect(mockCliUploadSourceMaps).toHaveBeenCalledWith(
        'some-release-name',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          include: expect.arrayContaining([
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            expect.objectContaining({
              // Should use buildArtifactPaths directly
              paths: ['.next', 'dist'],
              rewrite: true,
              dist: '1',
            }),
          ]),
          live: 'rejectOnError',
        }),
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

      expect(mockCliUploadSourceMaps).not.toHaveBeenCalled();
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

      expect(mockCliUploadSourceMaps).not.toHaveBeenCalled();
      expect(mockGlobFiles).not.toHaveBeenCalled();
      expect(mockPrepareBundleForDebugIdUpload).not.toHaveBeenCalled();
    });

    it('prepares into temp folder and uploads when prepareArtifacts is true (default)', async () => {
      mockCliUploadSourceMaps.mockResolvedValue(undefined);

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
      // Should upload from temp folder
      expect(mockCliUploadSourceMaps).toHaveBeenCalledWith('some-release-name', {
        include: [{ paths: ['/tmp/sentry-upload-xyz'], rewrite: false, dist: '1' }],
        projects: ['p'],
        live: 'rejectOnError',
      });
    });
  });

  describe('injectDebugIds', () => {
    it('should call CLI with correct sourcemaps inject command', async () => {
      mockCliExecute.mockResolvedValue(undefined);

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

      expect(mockCliExecute).toHaveBeenCalledWith(
        ['sourcemaps', 'inject', '--ignore', 'node_modules', '/path/to/1', '/path/to/2'],
        false,
      );
    });

    it('should pass "rejectOnError" flag when options.debug is true', async () => {
      mockCliExecute.mockResolvedValue(undefined);

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

      const buildArtifactPaths = ['/path/to/bundle'];
      await buildPluginManager.injectDebugIds(buildArtifactPaths);

      expect(mockCliExecute).toHaveBeenCalledWith(
        ['sourcemaps', 'inject', '--ignore', 'node_modules', '/path/to/bundle'],
        'rejectOnError',
      );
    });
  });

  describe('uploadSourcemaps with multiple projects', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGlobFiles.mockResolvedValue(['/path/to/bundle.js']);
      mockPrepareBundleForDebugIdUpload.mockResolvedValue(undefined);
      mockCliUploadSourceMaps.mockResolvedValue(undefined);

      // Mock fs operations needed for temp folder upload path
      vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue('/tmp/sentry-test');
      vi.spyOn(fs.promises, 'readdir').mockResolvedValue([]);
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1000 } as fs.Stats);
      vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should pass projects array to uploadSourceMaps when multiple projects configured', async () => {
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

      expect(mockCliUploadSourceMaps).toHaveBeenCalledWith(
        'test-release',
        expect.objectContaining({
          projects: ['proj-a', 'proj-b', 'proj-c'],
        }),
      );
    });

    it('should pass single project as array to uploadSourceMaps', async () => {
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

      expect(mockCliUploadSourceMaps).toHaveBeenCalledWith(
        'test-release',
        expect.objectContaining({
          projects: ['single-project'],
        }),
      );
    });

    it('should pass projects array in direct upload mode', async () => {
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

      expect(mockCliUploadSourceMaps).toHaveBeenCalledWith(
        'test-release',
        expect.objectContaining({
          projects: ['proj-a', 'proj-b'],
        }),
      );
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
    it('should not pass sentry-trace or baggage headers to CLI when telemetry is false', async () => {
      mockCliExecute.mockResolvedValue(undefined);

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

      // Trigger a CLI operation so createCliInstance is called
      await buildPluginManager.injectDebugIds(['/path/to/bundle']);

      // Find the CLI constructor call that was made by createCliInstance (not the one from allowedToSendTelemetry)
      const cliConstructorCalls = mockCliConstructor.mock.calls;
      expect(cliConstructorCalls.length).toBeGreaterThan(0);

      // Check that none of the CLI instances were created with sentry-trace or baggage headers
      for (const call of cliConstructorCalls) {
        const options = call[1] as { headers?: Record<string, string> };
        if (options?.headers) {
          expect(options.headers).not.toHaveProperty('sentry-trace');
          expect(options.headers).not.toHaveProperty('baggage');
        }
      }
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

      expect(mockCliNewDeploy).toHaveBeenCalledTimes(1);
      expect(mockCliNewDeploy).toHaveBeenCalledWith('test-release', { env: 'production' });
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

      expect(mockCliNewDeploy).toHaveBeenCalledTimes(1);
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

      expect(mockCliNewDeploy).toHaveBeenCalledTimes(1);
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

      expect(mockCliNewDeploy).toHaveBeenCalledTimes(2);
      expect(mockCliNewDeploy).toHaveBeenCalledWith('release-1', { env: 'production' });
      expect(mockCliNewDeploy).toHaveBeenCalledWith('release-2', { env: 'production' });
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

      expect(mockCliNewDeploy).not.toHaveBeenCalled();
    });
  });
});
