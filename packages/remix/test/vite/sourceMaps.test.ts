import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeEnableSourceMapsPlugin,
} from '../../src/vite/sourceMaps';

let capturedOptions: SentryVitePluginOptions | undefined;

const sentryVitePluginSpy = vi.fn((options: SentryVitePluginOptions) => {
  capturedOptions = options;
  return [{ name: 'sentry-vite-plugin' }];
});

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: SentryVitePluginOptions) => sentryVitePluginSpy(options),
}));

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions = undefined;
  delete process.env.SENTRY_ORG;
  delete process.env.SENTRY_PROJECT;
  delete process.env.SENTRY_AUTH_TOKEN;
});

describe('makeEnableSourceMapsPlugin', () => {
  it('returns a build-time plugin that updates the source map setting', () => {
    const plugin = makeEnableSourceMapsPlugin({});

    expect(plugin.name).toBe('sentry-remix-update-source-map-setting');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('post');
  });

  it('enables hidden source maps through its config hook', () => {
    const plugin = makeEnableSourceMapsPlugin({});
    const config = plugin.config as (config: UserConfig) => UserConfig;

    expect(config({}).build?.sourcemap).toBe('hidden');
  });
});

describe('getUpdatedSourceMapSettings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('keeps source maps disabled when the user turned them off', () => {
    expect(getUpdatedSourceMapSettings({ build: { sourcemap: false } })).toBe(false);
    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Source map generation is disabled'));
  });

  it.each([['hidden'], ['inline'], [true]] as ('hidden' | 'inline' | boolean)[][])(
    'keeps the explicit `%s` setting',
    setting => {
      expect(getUpdatedSourceMapSettings({ build: { sourcemap: setting } })).toBe(setting);
    },
  );

  it.each([[undefined], ['invalid'], [null]])('enables hidden source maps when the setting is %s', setting => {
    expect(getUpdatedSourceMapSettings({ build: { sourcemap: setting as any } })).toBe('hidden');
  });

  it('enables hidden source maps when there is no build config', () => {
    expect(getUpdatedSourceMapSettings({})).toBe('hidden');
  });
});

describe('makeAddSentryVitePlugin', () => {
  it('forwards the user-specified options to the bundler plugin', () => {
    const errorHandler = vi.fn();

    makeAddSentryVitePlugin({
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-token',
      sentryUrl: 'https://custom.sentry.io',
      headers: { 'X-Custom-Header': 'value' },
      silent: true,
      errorHandler,
      release: { name: 'my-release' },
      bundleSizeOptimizations: { excludeTracing: true },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-token',
        url: 'https://custom.sentry.io',
        headers: { 'X-Custom-Header': 'value' },
        silent: true,
        errorHandler,
        release: { name: 'my-release' },
        bundleSizeOptimizations: { excludeTracing: true },
      }),
    );
  });

  it('falls back to the Sentry environment variables', () => {
    process.env.SENTRY_ORG = 'env-org';
    process.env.SENTRY_PROJECT = 'env-project';
    process.env.SENTRY_AUTH_TOKEN = 'env-token';

    makeAddSentryVitePlugin({});

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'env-org', project: 'env-project', authToken: 'env-token' }),
    );
  });

  it('reports remix as the metaFramework', () => {
    makeAddSentryVitePlugin({});

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _metaOptions: { telemetry: { metaFramework: 'remix' } } }),
    );
  });

  // Unlike React Router - which uploads from `sentryOnBuildEnd` and therefore has to keep the
  // bundler plugin's own upload switched off - this plugin *is* the uploader, so `disable` must
  // stay whatever the user chose.
  it('leaves the source map upload enabled', () => {
    makeAddSentryVitePlugin({});

    expect(capturedOptions?.sourcemaps?.disable).toBeUndefined();
  });

  it('deletes the generated source maps when the user configured neither setting', async () => {
    const plugins = makeAddSentryVitePlugin({});
    const configPlugin = plugins.find(plugin => plugin.name === 'sentry-remix-files-to-delete-after-upload');

    (configPlugin?.config as (config: UserConfig) => void)({});

    await expect(capturedOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toEqual(['./build/**/*.map']);
  });

  // Remix's `buildDirectory` is configurable, and it runs a client and an SSR build with their own
  // `outDir`s - a hardcoded `./build/**/*.map` would leave a custom output directory's maps on disk.
  it('scopes the deletion glob to the configured outDir', async () => {
    const plugins = makeAddSentryVitePlugin({});
    const configPlugin = plugins.find(plugin => plugin.name === 'sentry-remix-files-to-delete-after-upload');

    (configPlugin?.config as (config: UserConfig) => void)({ build: { outDir: 'dist/client' } });

    await expect(capturedOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toEqual(['./dist/client/**/*.map']);
  });

  it('keeps the source maps when the user set their own build.sourcemap', async () => {
    const plugins = makeAddSentryVitePlugin({});
    const configPlugin = plugins.find(plugin => plugin.name === 'sentry-remix-files-to-delete-after-upload');

    (configPlugin?.config as (config: UserConfig) => void)({ build: { sourcemap: 'hidden' } });

    await expect(capturedOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toBeUndefined();
  });

  // `disable: 'disable-upload'` injects debug IDs but leaves the upload to the user. The bundler
  // plugin deletes in a `finally` block even when it skipped uploading, so defaulting the deletion
  // here would remove the maps they still have to upload by hand.
  it('keeps the source maps when only the upload is disabled', async () => {
    const plugins = makeAddSentryVitePlugin({ sourcemaps: { disable: 'disable-upload' } });
    const configPlugin = plugins.find(plugin => plugin.name === 'sentry-remix-files-to-delete-after-upload');

    (configPlugin?.config as (config: UserConfig) => void)({});

    await expect(capturedOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toBeUndefined();
  });

  it('honours a user-specified filesToDeleteAfterUpload', async () => {
    const plugins = makeAddSentryVitePlugin({ sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] } });
    const configPlugin = plugins.find(plugin => plugin.name === 'sentry-remix-files-to-delete-after-upload');

    (configPlugin?.config as (config: UserConfig) => void)({});

    await expect(capturedOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toEqual(['./dist/**/*.map']);
  });
});
