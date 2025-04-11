import * as fs from 'fs';
import SentryCli from '@sentry/cli';
import { glob } from 'glob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryOnBuildEnd } from '../../../src/vite/buildEnd/handleOnBuildEnd';

// Mock dependencies
vi.mock('@sentry/cli');
vi.mock('fs', () => ({
  promises: {
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('glob');

describe('sentryOnBuildEnd', () => {
  const mockSentryCliInstance = {
    releases: {
      new: vi.fn(),
      uploadSourceMaps: vi.fn(),
    },
    execute: vi.fn(),
  };

  const defaultConfig = {
    buildManifest: undefined,
    reactRouterConfig: {
      appDirectory: '/app',
      basename: '/',
      buildDirectory: '/build',
      future: {
        unstable_optimizeDeps: false,
      },
      prerender: undefined,
      routes: {},
      serverBuildFile: 'server.js',
      serverModuleFormat: 'esm' as const,
      ssr: true,
    },
    viteConfig: {
      build: {
        sourcemap: true,
      },
      sentryConfig: {
        authToken: 'test-token',
        org: 'test-org',
        project: 'test-project',
        debug: false,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mocking constructor
    SentryCli.mockImplementation(() => mockSentryCliInstance);
    vi.mocked(glob).mockResolvedValue(['/build/file1.map', '/build/file2.map']);
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should create a new Sentry release when release name is provided', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          release: {
            name: 'v1.0.0',
          },
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.new).toHaveBeenCalledWith('v1.0.0');
  });

  it('should upload source maps when enabled', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            enabled: true,
          },
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.uploadSourceMaps).toHaveBeenCalledWith('undefined', {
      include: [{ paths: ['/build'] }],
    });
  });

  it('should not upload source maps when explicitly disabled', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            enabled: false,
          },
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.uploadSourceMaps).not.toHaveBeenCalled();
  });

  it('should delete source maps after upload with default pattern', async () => {
    await sentryOnBuildEnd(defaultConfig);

    expect(glob).toHaveBeenCalledWith(['/build/**/*.map'], {
      absolute: true,
      nodir: true,
    });
  });

  it('should delete custom files after upload when specified', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            filesToDeleteAfterUpload: '/custom/**/*.map',
          },
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(glob).toHaveBeenCalledWith('/custom/**/*.map', {
      absolute: true,
      nodir: true,
    });
  });

  it('should handle errors during release creation gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentryCliInstance.releases.new.mockRejectedValueOnce(new Error('Release creation failed'));

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          release: {
            name: 'v1.0.0',
          },
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not create release', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should inject debug IDs before uploading source maps', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            enabled: true,
          },
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.execute).toHaveBeenCalledWith(['sourcemaps', 'inject', '/build'], false);
  });

  it('should handle errors during debug ID injection gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentryCliInstance.execute.mockRejectedValueOnce(new Error('Injection failed'));

    await sentryOnBuildEnd(defaultConfig);

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not inject debug ids', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should handle errors during source map upload gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentryCliInstance.releases.uploadSourceMaps.mockRejectedValueOnce(new Error('Upload failed'));

    await sentryOnBuildEnd(defaultConfig);

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not upload sourcemaps', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should log debug information when debug is enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          debug: true,
        },
      },
    };

    await sentryOnBuildEnd(config);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Sentry] Automatically setting'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deleting asset after upload:'));
    consoleSpy.mockRestore();
  });
});
