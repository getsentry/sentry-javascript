import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeEnableSourceMapsVitePlugin,
} from '../../src/vite/sourceMaps';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

const sentryVitePluginSpy = vi.fn((_options: SentryVitePluginOptions) => [mockedSentryVitePlugin]);

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: (options: SentryVitePluginOptions) => sentryVitePluginSpy(options),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeEnableSourceMapsVitePlugin()', () => {
  it('returns a plugin to enable source maps', () => {
    const sourceMapsConfigPlugins = makeEnableSourceMapsVitePlugin({});
    const enableSourceMapPlugin = sourceMapsConfigPlugins[0];

    expect(enableSourceMapPlugin?.name).toEqual('sentry-tanstackstart-react-source-maps');
    expect(enableSourceMapPlugin?.apply).toEqual('build');
    expect(enableSourceMapPlugin?.enforce).toEqual('post');
    expect(enableSourceMapPlugin?.config).toEqual(expect.any(Function));

    expect(sourceMapsConfigPlugins).toHaveLength(1);
  });
});

describe('makeAddSentryVitePlugin()', () => {
  it('passes user-specified vite plugin options to vite plugin', async () => {
    const errorHandler = vi.fn();
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      sentryUrl: 'https://custom.sentry.io',
      headers: { 'X-Custom-Header': 'value' },
      silent: true,
      errorHandler,
      release: {
        name: 'my-release',
        inject: true,
        create: true,
        finalize: true,
        dist: 'dist-1',
      },
      sourcemaps: {
        assets: ['dist/**/*.js'],
        disable: false,
        ignore: ['node_modules/**'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
      bundleSizeOptimizations: {
        excludeTracing: true,
      },
    });

    // The filesToDeleteAfterUpload is now a Promise that resolves when the config hook runs
    const calledOptions = sentryVitePluginSpy.mock.calls[0]?.[0];
    expect(calledOptions?.sourcemaps?.filesToDeleteAfterUpload).toBeInstanceOf(Promise);

    // Trigger the config hook to resolve the Promise
    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    (configPlugin?.config as (config: UserConfig) => void)({});

    // Verify the Promise resolves to the user-specified value
    const resolvedFilesToDelete = await calledOptions?.sourcemaps?.filesToDeleteAfterUpload;
    expect(resolvedFilesToDelete).toEqual(['baz/*.js']);

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'my-org',
        authToken: 'my-token',
        url: 'https://custom.sentry.io',
        headers: { 'X-Custom-Header': 'value' },
        silent: true,
        errorHandler,
        release: {
          name: 'my-release',
          inject: true,
          create: true,
          finalize: true,
          dist: 'dist-1',
        },
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      }),
    );
  });

  it('returns Sentry Vite plugins and config plugin', () => {
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
    });

    expect(plugins.length).toBeGreaterThanOrEqual(2);

    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    expect(configPlugin).toBeDefined();
    expect(configPlugin?.apply).toBe('build');
    expect(configPlugin?.enforce).toBe('post');
    expect(typeof configPlugin?.config).toBe('function');
  });

  it('uses default filesToDeleteAfterUpload when not specified', async () => {
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
    });

    // The filesToDeleteAfterUpload is now a Promise
    const calledOptions = sentryVitePluginSpy.mock.calls[0]?.[0];
    expect(calledOptions?.sourcemaps?.filesToDeleteAfterUpload).toBeInstanceOf(Promise);

    // Trigger the config hook to resolve the Promise (with no sourcemap configured)
    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    (configPlugin?.config as (config: UserConfig) => void)({});

    // Verify the Promise resolves to the default value
    const resolvedFilesToDelete = await calledOptions?.sourcemaps?.filesToDeleteAfterUpload;
    expect(resolvedFilesToDelete).toEqual(['./**/*.map']);
  });

  it('does not auto-delete when user configured build.sourcemap', async () => {
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
    });

    // The filesToDeleteAfterUpload is a Promise
    const calledOptions = sentryVitePluginSpy.mock.calls[0]?.[0];
    expect(calledOptions?.sourcemaps?.filesToDeleteAfterUpload).toBeInstanceOf(Promise);

    // Trigger the config hook with sourcemap configured by user
    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    (configPlugin?.config as (config: UserConfig) => void)({ build: { sourcemap: true } });

    // Verify the Promise resolves to undefined (no auto-delete)
    const resolvedFilesToDelete = await calledOptions?.sourcemaps?.filesToDeleteAfterUpload;
    expect(resolvedFilesToDelete).toBeUndefined();
  });

  it('logs auto-delete message when user did not configure sourcemap', () => {
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      debug: true,
    });

    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    expect(configPlugin).toBeDefined();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Simulate config hook with no sourcemap configured
    if (configPlugin?.config) {
      (configPlugin.config as (config: UserConfig) => void)({});
    }

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Automatically setting'));

    consoleSpy.mockRestore();
  });

  it('does not log auto-delete message when user configured sourcemap', () => {
    const plugins = makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      debug: true,
    });

    const configPlugin = plugins.find(p => p.name === 'sentry-tanstackstart-files-to-delete-after-upload-plugin');
    expect(configPlugin).toBeDefined();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Simulate config hook with sourcemap configured
    if (configPlugin?.config) {
      (configPlugin.config as (config: UserConfig) => void)({ build: { sourcemap: true } });
    }

    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Automatically setting'));

    consoleSpy.mockRestore();
  });

  it('sets the correct metaFramework in telemetry options', () => {
    makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: {
          telemetry: {
            metaFramework: 'tanstackstart-react',
          },
        },
      }),
    );
  });
});

describe('getUpdatedSourceMapSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should keep sourcemap as false and emit warning when explicitly disabled', () => {
    const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } });

    expect(result).toBe(false);
    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    ['hidden', 'hidden'],
    ['inline', 'inline'],
    [true, true],
  ] as const)('should keep sourcemap as %s when explicitly set', (input, expected) => {
    const result = getUpdatedSourceMapSettings({ build: { sourcemap: input } });

    expect(result).toBe(expected);
  });

  it('should set sourcemap to hidden when not configured', () => {
    const result = getUpdatedSourceMapSettings({});

    expect(result).toBe('hidden');
  });
});
