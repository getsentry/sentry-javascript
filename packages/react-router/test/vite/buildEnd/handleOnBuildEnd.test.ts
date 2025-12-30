import SentryCli from '@sentry/cli';
import * as fs from 'fs';
import { glob } from 'glob';
import type { ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryOnBuildEnd } from '../../../src/vite/buildEnd/handleOnBuildEnd';
import type { SentryReactRouterBuildOptions } from '../../../src/vite/types';

vi.mock('@sentry/cli');
vi.mock('fs', () => ({
  promises: {
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('glob');

type TestConfig = ResolvedConfig & {
  sentryConfig: SentryReactRouterBuildOptions;
};

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
    } as unknown as TestConfig,
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.new).toHaveBeenCalledWith('v1.0.0');
  });

  it('should create a new Sentry release when release name is provided in unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: {
            release: {
              name: 'v1.0.0-unstable',
            },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.new).toHaveBeenCalledWith('v1.0.0-unstable');
  });

  it('should prioritize release name from main config over unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          release: {
            name: 'v1.0.0',
          },
          unstable_sentryVitePluginOptions: {
            release: {
              name: 'v1.0.0-unstable',
            },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.uploadSourceMaps).toHaveBeenCalledTimes(1);
    expect(mockSentryCliInstance.releases.uploadSourceMaps).toHaveBeenCalledWith('undefined', {
      include: [{ paths: ['/build'] }],
      live: 'rejectOnError',
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.releases.uploadSourceMaps).not.toHaveBeenCalled();
  });

  it('should delete source maps after upload with default pattern', async () => {
    // @ts-expect-error - mocking the React config
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentryCliInstance.execute).toHaveBeenCalledWith(['sourcemaps', 'inject', '/build'], false);
  });

  it('should handle errors during debug ID injection gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentryCliInstance.execute.mockRejectedValueOnce(new Error('Injection failed'));

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);
    expect(mockSentryCliInstance.execute).toHaveBeenCalledTimes(1);
    expect(mockSentryCliInstance.execute).toHaveBeenCalledWith(['sourcemaps', 'inject', '/build'], false);

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not inject debug ids', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should handle errors during source map upload gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentryCliInstance.releases.uploadSourceMaps.mockRejectedValueOnce(new Error('Upload failed'));

    // @ts-expect-error - mocking the React config
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
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Sentry] Automatically setting'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deleting asset after upload:'));
    // rejectOnError is used in debug mode to pipe debug id injection output from the CLI to this process's stdout
    expect(mockSentryCliInstance.execute).toHaveBeenCalledWith(['sourcemaps', 'inject', '/build'], 'rejectOnError');

    consoleSpy.mockRestore();
  });

  it('should pass unstable_sentryVitePluginOptions to SentryCli constructor', async () => {
    const customOptions = {
      url: 'https://custom-instance.ejemplo.es',
      headers: {
        'X-Custom-Header': 'test-value',
      },
      timeout: 30000,
    };

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: customOptions,
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(SentryCli).toHaveBeenCalledWith(null, expect.objectContaining(customOptions));
  });

  it('handles multiple projects from unstable_sentryVitePluginOptions (use first only)', async () => {
    const customOptions = {
      url: 'https://custom-instance.ejemplo.es',
      headers: {
        'X-Custom-Header': 'test-value',
      },
      timeout: 30000,
      project: ['project1', 'project2'],
    };

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: customOptions,
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(SentryCli).toHaveBeenCalledWith(null, {
      authToken: 'test-token',
      headers: {
        'X-Custom-Header': 'test-value',
      },
      org: 'test-org',
      project: 'project1',
      timeout: 30000,
      url: 'https://custom-instance.ejemplo.es',
    });
  });
});
