import { createSentrySDK } from 'sentry';
import { rm } from 'node:fs/promises';
import { globFiles } from '@sentry/bundler-plugins/core';
import type { ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryOnBuildEnd } from '../../../src/vite/buildEnd/handleOnBuildEnd';
import type { SentryReactRouterBuildOptions } from '../../../src/vite/types';

vi.mock('sentry');
vi.mock('node:fs/promises', () => {
  const rm = vi.fn().mockResolvedValue(undefined);
  return { rm, default: { rm } };
});
vi.mock('@sentry/bundler-plugins/core', () => ({ globFiles: vi.fn() }));

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
    mockSentrySdkInstance.sourcemap.upload.mockReset();
    vi.mocked(createSentrySDK)
      .mockReset()
      .mockReturnValue(mockSentrySdkInstance as unknown as ReturnType<typeof createSentrySDK>);
    vi.mocked(globFiles).mockResolvedValue(['/build/file1.map', '/build/file2.map']);
    vi.mocked(rm).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({
      orgVersion: 'v1.0.0',
      project: 'test-project',
    });
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
      headers: undefined,
    });
    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({ orgVersion: '1.2.3', project: 'my-project' });
    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledWith({
      directory: '/build',
      release: '1.2.3',
    });
    expect(globFiles).toHaveBeenCalledWith(['./build/custom/**/*.map']);
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

  it('creates a release for both projects and uploads to each with one debug ID injection', async () => {
    const upload = vi.fn();
    vi.mocked(createSentrySDK).mockImplementation(options => {
      const clientUpload: ReturnType<typeof createSentrySDK>['sourcemap']['upload'] = params =>
        upload(options?.project, params);
      return {
        ...mockSentrySdkInstance,
        sourcemap: {
          ...mockSentrySdkInstance.sourcemap,
          upload: clientUpload,
        },
      } as unknown as ReturnType<typeof createSentrySDK>;
    });
    const sentryConfig: SentryReactRouterBuildOptions = {
      ...defaultConfig.viteConfig.sentryConfig,
      project: ['frontend', 'backend'],
      release: { name: 'v1.0.0' },
    };
    const config = {
      ...defaultConfig,
      viteConfig: { ...defaultConfig.viteConfig, sentryConfig },
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledExactlyOnceWith({
      orgVersion: 'v1.0.0',
      project: 'frontend,backend',
    });
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledExactlyOnceWith({ directory: '/build' });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledWith('frontend', { directory: '/build', release: 'v1.0.0' });
    expect(upload).toHaveBeenCalledWith('backend', { directory: '/build', release: 'v1.0.0' });
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
    expect(globFiles).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
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
    expect(globFiles).not.toHaveBeenCalled();
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

    expect(globFiles).toHaveBeenCalledWith('/custom/**/*.map');
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

  it('logs a failed project upload and still runs cleanup', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const uploadError = new Error('Backend upload failed');
    mockSentrySdkInstance.sourcemap.upload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(uploadError);
    const sentryConfig: SentryReactRouterBuildOptions = {
      ...defaultConfig.viteConfig.sentryConfig,
      project: ['frontend', 'backend'],
    };
    const config = {
      ...defaultConfig,
      viteConfig: { ...defaultConfig.viteConfig, sentryConfig },
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not upload sourcemaps', uploadError);
    expect(rm).toHaveBeenCalledTimes(2);
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

  it('should pass top-level sentryUrl and headers to createSentrySDK', async () => {
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
        headers: { 'X-Custom-Header': 'test-value' },
      }),
    );
  });
});
