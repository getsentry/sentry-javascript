import { createSentrySDK } from 'sentry';
import * as fs from 'fs';
import { glob } from 'glob';
import type { ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryOnBuildEnd } from '../../../src/vite/buildEnd/handleOnBuildEnd';
import type { SentryReactRouterBuildOptions } from '../../../src/vite/types';

vi.mock('sentry');
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
  const mockSentrySdkInstance = {
    release: {
      create: vi.fn(),
    },
    sourcemap: {
      upload: vi.fn(),
      inject: vi.fn(),
    },
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
    vi.mocked(createSentrySDK).mockReturnValue(mockSentrySdkInstance as unknown as ReturnType<typeof createSentrySDK>);
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

    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({ orgVersion: 'v1.0.0' });
  });

  it('resolves root-level BuildTimeOptionsBase options for release creation and source map upload', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          org: 'my-org',
          project: 'my-project',
          authToken: 'my-token',
          release: { name: '1.2.3' },
          sourcemaps: {
            filesToDeleteAfterUpload: ['./build/custom/**/*.map'],
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(createSentrySDK).toHaveBeenCalledWith({
      token: 'my-token',
      org: 'my-org',
      project: 'my-project',
      url: undefined,
    });
    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({ orgVersion: '1.2.3' });
    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledWith({
      directory: '/build',
      release: '1.2.3',
    });
    expect(glob).toHaveBeenCalledWith(['./build/custom/**/*.map'], {
      absolute: true,
      nodir: true,
    });
  });

  it('should upload source maps when enabled', async () => {
    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);

    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledTimes(1);
    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledWith({
      directory: '/build',
      release: 'undefined',
    });
  });

  it('should not upload or inject source maps when disabled via top-level sourcemaps.disable', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: true },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).not.toHaveBeenCalled();
    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
  });

  // `'disable-upload'` means "inject debug IDs, but let me upload the maps myself", so
  // injection must still run and the maps must survive.
  it('should inject debug IDs but skip upload and deletion when disable is "disable-upload"', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: 'disable-upload' },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });
    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
    expect(glob).not.toHaveBeenCalled();
  });

  // Deleting maps that were never uploaded would leave the user with neither.
  it('should not delete source maps when upload is disabled', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: true },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(glob).not.toHaveBeenCalled();
    expect(fs.promises.rm).not.toHaveBeenCalled();
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
          sourcemaps: {
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
    mockSentrySdkInstance.release.create.mockRejectedValueOnce(new Error('Release creation failed'));

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
    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);

    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });
  });

  it('should handle errors during debug ID injection gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentrySdkInstance.sourcemap.inject.mockRejectedValueOnce(new Error('Injection failed'));

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledTimes(1);
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not inject debug ids', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should handle errors during source map upload gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentrySdkInstance.sourcemap.upload.mockRejectedValueOnce(new Error('Upload failed'));

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
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });

    consoleSpy.mockRestore();
  });

  // Self-hosted setups need the buildEnd upload pointed at their instance, so `sentryUrl`
  // has to reach the CLI SDK from the top-level config. `headers` has no SDK equivalent.
  it('should pass top-level sentryUrl to createSentrySDK', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sentryUrl: 'https://custom-instance.ejemplo.es',
          headers: {
            'X-Custom-Header': 'test-value',
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(createSentrySDK).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://custom-instance.ejemplo.es',
      }),
    );
    expect(createSentrySDK).not.toHaveBeenCalledWith(expect.objectContaining({ headers: expect.anything() }));
  });
});
