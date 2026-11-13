import type { SentryVitePluginInternalOptions } from '@sentry/bundler-plugins/vite';
import type { UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceMapState } from '../../src/vite/sourceMaps';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeEnableSourceMapsPlugin,
} from '../../src/vite/sourceMaps';

let capturedOptions: SentryVitePluginInternalOptions | undefined;

const sentryVitePluginSpy = vi.fn((options: SentryVitePluginInternalOptions) => {
  capturedOptions = options;
  return [{ name: 'sentry-vite-plugin' }];
});

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: SentryVitePluginInternalOptions) => sentryVitePluginSpy(options),
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

  it('enables hidden source maps through its config hook and records it', () => {
    const state: SourceMapState = { sdkEnabledSourceMaps: false };
    const plugin = makeEnableSourceMapsPlugin({}, state);
    const config = plugin.config as (config: UserConfig) => UserConfig;

    expect(config({}).build?.sourcemap).toBe('hidden');
    expect(state.sdkEnabledSourceMaps).toBe(true);
  });

  it.each([['hidden'], [true], [false]] as const)('does not record a `%s` setting the user made', setting => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const state: SourceMapState = { sdkEnabledSourceMaps: true };
    const plugin = makeEnableSourceMapsPlugin({}, state);

    (plugin.config as (config: UserConfig) => UserConfig)({ build: { sourcemap: setting } });

    expect(state.sdkEnabledSourceMaps).toBe(false);
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

  function getDeleteOption(): boolean | undefined {
    const value = capturedOptions?.sourcemaps?.deleteSourcemapsAfterUpload;
    return typeof value === 'function' ? value() : value;
  }

  it('asks for deletion once the SDK enabled the source maps', () => {
    const state: SourceMapState = { sdkEnabledSourceMaps: false };
    makeAddSentryVitePlugin({}, state);

    expect(getDeleteOption()).toBeUndefined();
    state.sdkEnabledSourceMaps = true;
    expect(getDeleteOption()).toBe(true);
  });

  // With `disable: 'disable-upload'` the user uploads the maps by hand.
  it('keeps the source maps when only the upload is disabled', () => {
    makeAddSentryVitePlugin({ sourcemaps: { disable: 'disable-upload' } }, { sdkEnabledSourceMaps: true });

    expect(getDeleteOption()).toBeUndefined();
  });

  it.each([true, false])('passes a user-set `deleteSourcemapsAfterUpload: %s` through', value => {
    makeAddSentryVitePlugin({ sourcemaps: { deleteSourcemapsAfterUpload: value } }, { sdkEnabledSourceMaps: !value });

    expect(getDeleteOption()).toBe(value);
  });

  it('passes a user-set filesToDeleteAfterUpload through and still deletes the maps the SDK enabled', () => {
    makeAddSentryVitePlugin(
      { sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] } },
      { sdkEnabledSourceMaps: true },
    );

    expect(capturedOptions?.sourcemaps?.filesToDeleteAfterUpload).toEqual(['./dist/**/*.map']);
    expect(getDeleteOption()).toBe(true);
  });

  it('tells the bundler plugin whether the SDK enabled the source maps', () => {
    const state: SourceMapState = { sdkEnabledSourceMaps: false };
    makeAddSentryVitePlugin({}, state);
    const sdkEnabled = capturedOptions?.sourcemaps?.sdkEnabledSourceMaps as () => boolean;

    expect(sdkEnabled()).toBe(false);
    state.sdkEnabledSourceMaps = true;
    expect(sdkEnabled()).toBe(true);
  });
});
