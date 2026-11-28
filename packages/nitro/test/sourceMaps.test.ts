import type { NitroConfig } from 'nitro/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNitroOptions } from '../src/config';
import { setupSentryNitroModule } from '../src/config';
import { configureSourcemapSettings, getPluginOptions, setupSourceMaps } from '../src/sourceMaps';

vi.mock('../src/instruments/instrumentServer', () => ({
  instrumentServer: vi.fn(),
}));

describe('getPluginOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default options when no options are provided', () => {
    const options = getPluginOptions(undefined, true, '/project/.output/server');

    expect(options).toEqual(
      expect.objectContaining({
        telemetry: true,
        debug: false,
        silent: false,
        sourcemaps: expect.objectContaining({
          sdkFilesToDeleteAfterUpload: ['/project/.output/server/**/*.map'],
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nitro',
          }),
        }),
      }),
    );
    expect(options.sourcemaps?.filesToDeleteAfterUpload).toBeUndefined();
    expect(options.org).toBeUndefined();
    expect(options.project).toBeUndefined();
    expect(options.authToken).toBeUndefined();
    expect(options.url).toBeUndefined();
  });

  it('does not default filesToDeleteAfterUpload when user enabled sourcemaps themselves', () => {
    const options = getPluginOptions(undefined, false);

    expect(options.sourcemaps?.sdkFilesToDeleteAfterUpload).toBeUndefined();
  });

  it('respects user-provided filesToDeleteAfterUpload even when Sentry enabled sourcemaps', () => {
    const options = getPluginOptions(
      { sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] } },
      true,
      '/project/.output/server',
    );

    expect(options.sourcemaps?.sdkFilesToDeleteAfterUpload).toEqual(['dist/**/*.map']);
  });

  it('logs the default deletion glob in debug mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    getPluginOptions({ debug: true }, true, '/project/.output/server');

    expect(logSpy).toHaveBeenCalledWith(
      '[@sentry/nitro] Deleting the generated source maps after the upload: /project/.output/server/**/*.map',
    );
    logSpy.mockRestore();
  });

  it('does not log the default glob when user provides filesToDeleteAfterUpload', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    getPluginOptions(
      { debug: true, sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] } },
      true,
      '/project/.output/server',
    );

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Deleting the generated source maps'));
    logSpy.mockRestore();
  });

  it('uses environment variables as fallback', () => {
    process.env.SENTRY_ORG = 'env-org';
    process.env.SENTRY_PROJECT = 'env-project';
    process.env.SENTRY_AUTH_TOKEN = 'env-token';
    process.env.SENTRY_URL = 'https://custom.sentry.io';

    const options = getPluginOptions();

    expect(options.org).toBe('env-org');
    expect(options.project).toBe('env-project');
    expect(options.authToken).toBe('env-token');
    expect(options.url).toBe('https://custom.sentry.io'); // sentryUrl maps to url
  });

  it('prefers direct options over environment variables', () => {
    process.env.SENTRY_ORG = 'env-org';
    process.env.SENTRY_AUTH_TOKEN = 'env-token';
    process.env.SENTRY_URL = 'https://env.sentry.io';

    const options = getPluginOptions({
      org: 'direct-org',
      authToken: 'direct-token',
      sentryUrl: 'https://direct.sentry.io',
    });

    expect(options.org).toBe('direct-org');
    expect(options.authToken).toBe('direct-token');
    expect(options.url).toBe('https://direct.sentry.io');
  });

  it('passes through all user options', () => {
    const sentryOptions: SentryNitroOptions = {
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-token',
      sentryUrl: 'https://my-sentry.io',
      headers: { 'X-Custom': 'header' },
      debug: true,
      silent: true,
      telemetry: false,
      errorHandler: () => {},
      release: { name: 'v1.0.0' },
      sourcemaps: {
        assets: ['dist/**'],
        ignore: ['dist/test/**'],
        filesToDeleteAfterUpload: ['dist/**/*.map'],
      },
    };

    const options = getPluginOptions(sentryOptions);

    expect(options.org).toBe('my-org');
    expect(options.project).toBe('my-project');
    expect(options.authToken).toBe('my-token');
    expect(options.url).toBe('https://my-sentry.io');
    expect(options.headers).toEqual({ 'X-Custom': 'header' });
    expect(options.debug).toBe(true);
    expect(options.silent).toBe(true);
    expect(options.telemetry).toBe(false);
    expect(options.errorHandler).toBeDefined();
    expect(options.release).toEqual({ name: 'v1.0.0' });
    expect(options.sourcemaps?.assets).toEqual(['dist/**']);
    expect(options.sourcemaps?.ignore).toEqual(['dist/test/**']);
    expect(options.sourcemaps?.sdkFilesToDeleteAfterUpload).toEqual(['dist/**/*.map']);
  });

  it('normalizes source paths via rewriteSources', () => {
    const options = getPluginOptions();
    const rewriteSources = options.sourcemaps?.rewriteSources;

    expect(rewriteSources?.('../../../src/index.ts', undefined)).toBe('./src/index.ts');
    expect(rewriteSources?.('../../lib/utils.ts', undefined)).toBe('./lib/utils.ts');
    expect(rewriteSources?.('./src/index.ts', undefined)).toBe('./src/index.ts');
    expect(rewriteSources?.('src/index.ts', undefined)).toBe('src/index.ts');
  });

  it('uses user-provided rewriteSources when given', () => {
    const customRewrite = (source: string) => `/custom/${source}`;
    const options = getPluginOptions({ sourcemaps: { rewriteSources: customRewrite } });

    expect(options.sourcemaps?.rewriteSources?.('../../../src/index.ts', undefined)).toBe(
      '/custom/../../../src/index.ts',
    );
  });

  it('always sets metaFramework to nitro', () => {
    const options = getPluginOptions();

    expect(options._metaOptions?.telemetry?.metaFramework).toBe('nitro');
  });

  it('passes through sourcemaps.disable', () => {
    const options = getPluginOptions({ sourcemaps: { disable: 'disable-upload' } });

    expect(options.sourcemaps?.disable).toBe('disable-upload');
  });
});

describe('configureSourcemapSettings', () => {
  it('enables hidden sourcemap generation on the config', () => {
    const config: NitroConfig = {};
    const result = configureSourcemapSettings(config);

    expect(config.sourcemap).toBe('hidden');
    expect(result.sentryEnabledSourcemaps).toBe(true);
  });

  it('respects user explicitly disabling sourcemaps and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config: NitroConfig = { sourcemap: false };
    const result = configureSourcemapSettings(config);

    expect(config.sourcemap).toBe(false);
    expect(result.sentryEnabledSourcemaps).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('explicitly disabled source maps'));
    warnSpy.mockRestore();
  });

  it('does not warn about `sourcemap: false` with `sourcemaps.upload: false`', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureSourcemapSettings({ sourcemap: false }, { sourcemaps: { upload: false } });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not modify experimental config when user disabled sourcemaps', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config: NitroConfig = { sourcemap: false };
    configureSourcemapSettings(config);

    expect(config.experimental).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('keeps sourcemap true when user already set it', () => {
    const config: NitroConfig = { sourcemap: true };
    const result = configureSourcemapSettings(config);

    expect(config.sourcemap).toBe(true);
    expect(result.sentryEnabledSourcemaps).toBe(false);
  });

  it('keeps sourcemap "hidden" when user already set it and does not enable deletion', () => {
    const config = { sourcemap: 'hidden' } as unknown as NitroConfig;
    const result = configureSourcemapSettings(config);

    expect((config as { sourcemap?: unknown }).sourcemap).toBe('hidden');
    expect(result.sentryEnabledSourcemaps).toBe(false);
  });

  it('keeps sourcemap "inline", warns, and does not enable uploads', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { sourcemap: 'inline' } as unknown as NitroConfig;
    const result = configureSourcemapSettings(config);

    expect((config as { sourcemap?: unknown }).sourcemap).toBe('inline');
    expect(result.sentryEnabledSourcemaps).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`sourcemap: "inline"`'));
    warnSpy.mockRestore();
  });

  it('disables experimental sourcemapMinify', () => {
    const config: NitroConfig = {};
    configureSourcemapSettings(config);

    expect(config.experimental?.sourcemapMinify).toBe(false);
  });

  it('preserves existing experimental config', () => {
    const config: NitroConfig = {
      experimental: {
        sourcemapMinify: undefined,
      },
    };
    configureSourcemapSettings(config);

    expect(config.experimental?.sourcemapMinify).toBe(false);
  });

  it('skips sourcemap config when sourcemaps.disable is true', () => {
    const config: NitroConfig = { sourcemap: false };
    configureSourcemapSettings(config, { sourcemaps: { disable: true } });

    expect(config.sourcemap).toBe(false);
  });

  it('still configures sourcemaps when sourcemaps.disable is disable-upload', () => {
    const config: NitroConfig = {};
    configureSourcemapSettings(config, { sourcemaps: { disable: 'disable-upload' } });

    expect(config.sourcemap).toBe('hidden');
  });

  it.each([
    [{ upload: false }, undefined, false],
    [{ injectDebugIds: false }, undefined, false],
    [{ upload: false, delete: true }, undefined, false],
    [{ injectDebugIds: false, delete: false }, undefined, false],
    [{ upload: false, delete: false }, 'hidden', true],
    [{ delete: false }, 'hidden', true],
    [{ delete: true }, 'hidden', true],
    [{ disable: true, upload: true }, 'hidden', true],
  ] as const)('with an unset setting and `sourcemaps: %j` it sets %s', (sourcemaps, expected, sentryEnabled) => {
    const config: NitroConfig = {};
    const result = configureSourcemapSettings(config, { sourcemaps });

    expect(config.sourcemap).toBe(expected);
    expect(result.sentryEnabledSourcemaps).toBe(sentryEnabled);
    expect(config.experimental?.sourcemapMinify).toBe(false);
  });

  it('does not warn about `sourcemap: false` when Sentry uploads nothing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureSourcemapSettings({ sourcemap: false }, { sourcemaps: { upload: false } });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('getPluginOptions with the new source map options', () => {
  it('passes `upload` and `injectDebugIds` through', () => {
    const result = getPluginOptions({ sourcemaps: { upload: false, injectDebugIds: true } });

    expect(result.sourcemaps).toMatchObject({ upload: false, injectDebugIds: true });
  });

  it.each([
    ['deletes every source map with `delete: true`', { delete: true }, false, ['/output/server/**/*.map']],
    [
      'deletes the user files next to the source maps with `delete: true`',
      { delete: true, filesToDeleteAfterUpload: ['extra/**'] },
      false,
      ['/output/server/**/*.map', 'extra/**'],
    ],
    ['keeps the source maps Sentry enabled with `delete: false`', { delete: false }, true, undefined],
    [
      'deletes only the user files with `delete: false`',
      { delete: false, filesToDeleteAfterUpload: ['extra/**'] },
      true,
      ['extra/**'],
    ],
  ] as const)('%s', (_label, sourcemaps, sentryEnabled, expected) => {
    const result = getPluginOptions(
      { sourcemaps: { ...sourcemaps, filesToDeleteAfterUpload: sourcemaps.filesToDeleteAfterUpload?.slice() } },
      sentryEnabled,
      '/output/server',
    );

    expect(result.sourcemaps?.sdkFilesToDeleteAfterUpload).toEqual(expected);
  });
});

describe('setupSentryNitroModule', () => {
  it('enables tracing', () => {
    const config: NitroConfig = {};
    setupSentryNitroModule(config);

    expect(config.tracingChannel).toBe(true);
  });

  it('adds the sentry module', () => {
    const config: NitroConfig = {};
    setupSentryNitroModule(config);

    expect(config.modules).toBeDefined();
    expect(config.modules?.length).toBe(1);
  });

  it('still adds module when sourcemaps are disabled', () => {
    const config: NitroConfig = {};
    setupSentryNitroModule(config, { sourcemaps: { disable: true } });

    expect(config.modules).toBeDefined();
    expect(config.modules?.length).toBe(1);
  });
});

describe('setupSourceMaps', () => {
  // The plugin manager does not get `sourcemaps.delete`.
  it('warns about conflicting source map options', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nitro = {
      options: { dev: true, output: { serverDir: '/output/server' } },
      hooks: { hook: vi.fn() },
    } as any;

    setupSourceMaps(nitro, { sourcemaps: { delete: false, filesToDeleteAfterUpload: ['.output/**/*.map'] } });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('`sourcemaps.filesToDeleteAfterUpload` still deletes the files'),
    );
    warnSpy.mockRestore();
  });

  it('does not register hook in dev mode', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: true, output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro);

    expect(hookFn).not.toHaveBeenCalled();
  });

  it('does not register hook when sourcemaps.disable is true', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: false, output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro, { sourcemaps: { disable: true } });

    expect(hookFn).not.toHaveBeenCalled();
  });

  it('registers the hook for the release when nitro sourcemap is disabled', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: false, sourcemap: false, output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro);

    expect(hookFn).toHaveBeenCalledWith('compiled', expect.any(Function));
  });

  it('does not register hook in nitro-prerender preset', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: false, preset: 'nitro-prerender', output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro);

    expect(hookFn).not.toHaveBeenCalled();
  });

  it('registers compiled hook in production mode', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: false, output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro);

    expect(hookFn).toHaveBeenCalledWith('compiled', expect.any(Function));
  });

  it('registers compiled hook with custom options', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: false, output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro, { org: 'my-org', project: 'my-project' });

    expect(hookFn).toHaveBeenCalledWith('compiled', expect.any(Function));
  });
});
