import { loadModule } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRunAfterProductionCompile } from '../../src/config/handleRunAfterProductionCompile';
import type { SentryBuildOptions } from '../../src/config/types';

vi.mock('@sentry/core', () => ({
  loadModule: vi.fn(),
}));

vi.mock('../../src/config/getBuildPluginOptions', () => ({
  getBuildPluginOptions: vi.fn(() => ({
    org: 'test-org',
    project: 'test-project',
    sourcemaps: {},
  })),
}));

describe('handleRunAfterProductionCompile', () => {
  const mockCreateSentryBuildPluginManager = vi.fn();
  const mockSentryBuildPluginManager = {
    telemetry: {
      emitBundlerPluginExecutionSignal: vi.fn().mockResolvedValue(undefined),
    },
    createRelease: vi.fn().mockResolvedValue(undefined),
    injectDebugIds: vi.fn().mockResolvedValue(undefined),
    uploadSourcemaps: vi.fn().mockResolvedValue(undefined),
    deleteArtifacts: vi.fn().mockResolvedValue(undefined),
  };

  const mockSentryBuildOptions: SentryBuildOptions = {
    org: 'test-org',
    project: 'test-project',
    authToken: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSentryBuildPluginManager.mockReturnValue(mockSentryBuildPluginManager);
    (loadModule as any).mockReturnValue({
      createSentryBuildPluginManager: mockCreateSentryBuildPluginManager,
    });
  });

  describe('turbopack builds', () => {
    it('executes all build steps for turbopack builds', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.createRelease).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith(['/path/to/.next'], {
        prepareArtifacts: false,
      });
      expect(mockSentryBuildPluginManager.deleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('calls createSentryBuildPluginManager with correct options', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockCreateSentryBuildPluginManager).toHaveBeenCalledWith(
        expect.objectContaining({
          org: 'test-org',
          project: 'test-project',
          sourcemaps: expect.any(Object),
        }),
        {
          buildTool: 'turbopack',
          loggerPrefix: '[@sentry/nextjs - After Production Compile]',
        },
      );
    });

    it('handles debug mode correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const debugOptions = {
        ...mockSentryBuildOptions,
        debug: true,
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        debugOptions,
      );

      expect(consoleSpy).toHaveBeenCalledWith('[@sentry/nextjs] Running runAfterProductionCompile logic.');

      consoleSpy.mockRestore();
    });
  });

  describe('webpack builds', () => {
    it('executes all build steps for webpack builds', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'webpack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.createRelease).toHaveBeenCalledTimes(1);
      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith(['/path/to/.next'], {
        prepareArtifacts: false,
      });
      expect(mockSentryBuildPluginManager.deleteArtifacts).toHaveBeenCalledTimes(1);
    });

    it('logs debug message for webpack builds when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const debugOptions = {
        ...mockSentryBuildOptions,
        debug: true,
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'webpack',
        },
        debugOptions,
      );

      expect(consoleSpy).toHaveBeenCalledWith('[@sentry/nextjs] Running runAfterProductionCompile logic.');

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('handles missing bundler plugin core gracefully', async () => {
      (loadModule as any).mockReturnValue(null);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] Could not load build manager package. Will not run runAfterProductionCompile logic.',
      );
      expect(mockCreateSentryBuildPluginManager).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('handles missing createSentryBuildPluginManager export gracefully', async () => {
      (loadModule as any).mockReturnValue({});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] Could not load build manager package. Will not run runAfterProductionCompile logic.',
      );
      expect(mockCreateSentryBuildPluginManager).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('propagates errors from build plugin manager operations', async () => {
      const mockError = new Error('Test error');
      mockSentryBuildPluginManager.createRelease.mockRejectedValue(mockError);

      await expect(
        handleRunAfterProductionCompile(
          {
            releaseName: 'test-release',
            distDir: '/path/to/.next',
            buildTool: 'turbopack',
          },
          mockSentryBuildOptions,
        ),
      ).rejects.toThrow('Test error');
    });
  });

  describe('step execution order', () => {
    it('executes build steps in correct order', async () => {
      const executionOrder: string[] = [];

      mockSentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal.mockImplementation(async () => {
        executionOrder.push('telemetry');
      });
      mockSentryBuildPluginManager.createRelease.mockImplementation(async () => {
        executionOrder.push('createRelease');
      });
      mockSentryBuildPluginManager.injectDebugIds.mockImplementation(async () => {
        executionOrder.push('injectDebugIds');
      });
      mockSentryBuildPluginManager.uploadSourcemaps.mockImplementation(async () => {
        executionOrder.push('uploadSourcemaps');
      });
      mockSentryBuildPluginManager.deleteArtifacts.mockImplementation(async () => {
        executionOrder.push('deleteArtifacts');
      });

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(executionOrder).toEqual([
        'telemetry',
        'createRelease',
        'injectDebugIds',
        'uploadSourcemaps',
        'deleteArtifacts',
      ]);
    });
  });

  describe('sourcemaps disabled', () => {
    it('skips debug ID injection when sourcemaps.disable is true', async () => {
      const optionsWithDisabledSourcemaps: SentryBuildOptions = {
        ...mockSentryBuildOptions,
        sourcemaps: {
          disable: true,
        },
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        optionsWithDisabledSourcemaps,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).not.toHaveBeenCalled();
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalled();
    });

    it('still injects debug IDs when sourcemaps.disable is false', async () => {
      const optionsWithEnabledSourcemaps: SentryBuildOptions = {
        ...mockSentryBuildOptions,
        sourcemaps: {
          disable: false,
        },
      };

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        optionsWithEnabledSourcemaps,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
    });

    it('still injects debug IDs when sourcemaps option is undefined', async () => {
      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: '/path/to/.next',
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith(['/path/to/.next']);
    });
  });

  describe('path handling', () => {
    it('correctly passes distDir to debug ID injection', async () => {
      const customDistDir = '/custom/dist/path';

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: customDistDir,
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith([customDistDir]);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith([customDistDir], {
        prepareArtifacts: false,
      });
    });

    it('works with relative paths', async () => {
      const relativeDistDir = '.next';

      await handleRunAfterProductionCompile(
        {
          releaseName: 'test-release',
          distDir: relativeDistDir,
          buildTool: 'turbopack',
        },
        mockSentryBuildOptions,
      );

      expect(mockSentryBuildPluginManager.injectDebugIds).toHaveBeenCalledWith([relativeDistDir]);
      expect(mockSentryBuildPluginManager.uploadSourcemaps).toHaveBeenCalledWith([relativeDistDir], {
        prepareArtifacts: false,
      });
    });
  });
});
