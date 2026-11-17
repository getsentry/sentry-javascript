// @vitest-environment node
import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUpdatedSourceMapSettings, makeEnableSourceMapsPlugin } from '../../src/vite/makeEnableSourceMapsPlugin';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

const sentryVitePluginSpy = vi.fn((_options: SentryVitePluginOptions) => [mockedSentryVitePlugin]);

vi.mock('@sentry/bundler-plugins/vite', async () => {
  const original = (await vi.importActual('@sentry/bundler-plugins/vite')) as any;

  return {
    ...original,
    sentryVitePlugin: (options: SentryVitePluginOptions) => sentryVitePluginSpy(options),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeEnableSourceMapsPlugin()', () => {
  it('returns a plugin to set `sourcemaps` to `true`', () => {
    const enableSourceMapPlugin = makeEnableSourceMapsPlugin({});

    expect(enableSourceMapPlugin?.name).toEqual('sentry-react-router-update-source-map-setting');
    expect(enableSourceMapPlugin?.apply).toEqual('build');
    expect(enableSourceMapPlugin?.enforce).toEqual('post');
    expect(enableSourceMapPlugin?.config).toEqual(expect.any(Function));
  });

  it.each([undefined, false, true, 'hidden', 'inline'] as const)(
    'preserves user config without duplicating arrays when sourcemap is %s',
    sourcemap => {
      const plugin = makeEnableSourceMapsPlugin({});
      const configHook = plugin.config as (config: UserConfig) => UserConfig;
      const userConfig: UserConfig = {
        optimizeDeps: { include: ['react'] },
        build: {
          sourcemap,
          outDir: 'custom-dist',
          rollupOptions: { plugins: [{ name: 'asset-transform' }] },
        },
      };

      const merged = mergeConfig(userConfig, configHook(userConfig));

      expect(merged).toEqual({
        optimizeDeps: { include: ['react'] },
        build: {
          sourcemap: sourcemap ?? 'hidden',
          outDir: 'custom-dist',
          rollupOptions: { plugins: [{ name: 'asset-transform' }] },
          rolldownOptions: { plugins: [{ name: 'asset-transform' }] },
        },
      });
    },
  );
});

describe('getUpdatedSourceMapSettings with the source map options', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it.each([
    [{ upload: false }, undefined],
    [{ injectDebugIds: false }, undefined],
    [{ upload: false, delete: false }, 'hidden'],
    [{ injectDebugIds: false, delete: false }, undefined],
    [{ delete: false }, 'hidden'],
    [{ delete: true }, 'hidden'],
    [{ disable: true }, 'hidden'],
    [{ disable: 'disable-upload' }, 'hidden'],
    [{ disable: true, injectDebugIds: false }, undefined],
  ] as const)('with an unset setting and %j it returns %s', (sourcemaps, expected) => {
    expect(getUpdatedSourceMapSettings({}, { sourcemaps })).toBe(expected);
  });

  it.each([
    [true, { delete: true }, 'hidden'],
    ['hidden', { delete: true }, 'hidden'],
    ['inline', { delete: true }, 'inline'],
    [true, { delete: false }, true],
    [true, { upload: false }, true],
    [false, { delete: true }, false],
  ] as const)('with the setting %s and %j it returns %s', (sourcemap, sourcemaps, expected) => {
    expect(getUpdatedSourceMapSettings({ build: { sourcemap } }, { sourcemaps })).toBe(expected);
  });

  it('leaves the Vite config alone when it turns no source maps on', () => {
    const plugin = makeEnableSourceMapsPlugin({ sourcemaps: { upload: false } });
    const configHook = plugin.config as (config: UserConfig) => UserConfig;

    expect(configHook({})).toEqual({});
  });
});

describe('getUpdatedSourceMapSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('when sourcemap is false', () => {
    it('should keep sourcemap as false and show short warning when debug is disabled', () => {
      const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } });

      expect(result).toBe(false);
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        '[Sentry] Source map generation is disabled in your Vite configuration.',
      );
    });

    it('should keep sourcemap as false and show long warning when debug is enabled', () => {
      const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } }, { debug: true });

      expect(result).toBe(false);
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry] Source map generation is currently disabled in your Vite configuration'),
      );
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'This setting is either a default setting or was explicitly set in your configuration.',
        ),
      );
    });
  });

  describe('when sourcemap is explicitly set to valid values', () => {
    it.each([
      ['hidden', 'hidden'],
      ['inline', 'inline'],
      [true, true],
    ] as ('inline' | 'hidden' | boolean)[][])('should keep sourcemap as %s when set to %s', (input, expected) => {
      const result = getUpdatedSourceMapSettings({ build: { sourcemap: input } }, { debug: true });

      expect(result).toBe(expected);
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`[Sentry] We discovered \`vite.build.sourcemap\` is set to \`${input.toString()}\``),
      );
    });
  });

  describe('when sourcemap is undefined or invalid', () => {
    it.each([[undefined], ['invalid'], ['something'], [null]])(
      'should set sourcemap to hidden when value is %s',
      input => {
        const result = getUpdatedSourceMapSettings({ build: { sourcemap: input as any } }, { debug: true });

        expect(result).toBe('hidden');
        // eslint-disable-next-line no-console
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(
            "[Sentry] Enabled source map generation in the build options with `vite.build.sourcemap: 'hidden'`",
          ),
        );
      },
    );

    it('should set sourcemap to hidden when build config is empty', () => {
      const result = getUpdatedSourceMapSettings({}, { debug: true });

      expect(result).toBe('hidden');
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "[Sentry] Enabled source map generation in the build options with `vite.build.sourcemap: 'hidden'`",
        ),
      );
    });
  });
});
