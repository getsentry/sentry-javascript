import { debug } from '@sentry/core';
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
    const options = getPluginOptions();

    expect(options).toEqual(
      expect.objectContaining({
        telemetry: true,
        debug: false,
        silent: false,
        sourcemaps: expect.objectContaining({
          filesToDeleteAfterUpload: ['**/*.map'],
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nitro',
          }),
        }),
      }),
    );
    expect(options.org).toBeUndefined();
    expect(options.project).toBeUndefined();
    expect(options.authToken).toBeUndefined();
    expect(options.url).toBeUndefined();
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
    expect(options.url).toBe('https://custom.sentry.io');
  });

  it('prefers direct options over environment variables', () => {
    process.env.SENTRY_ORG = 'env-org';
    process.env.SENTRY_AUTH_TOKEN = 'env-token';

    const options = getPluginOptions({
      org: 'direct-org',
      authToken: 'direct-token',
    });

    expect(options.org).toBe('direct-org');
    expect(options.authToken).toBe('direct-token');
  });

  it('passes through all user options', () => {
    const sentryOptions: SentryNitroOptions = {
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-token',
      url: 'https://my-sentry.io',
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
    expect(options.sourcemaps?.filesToDeleteAfterUpload).toEqual(['dist/**/*.map']);
  });

  it('normalizes source paths via rewriteSources', () => {
    const options = getPluginOptions();
    const rewriteSources = options.sourcemaps?.rewriteSources;

    expect(rewriteSources?.('../../../src/index.ts', undefined)).toBe('./src/index.ts');
    expect(rewriteSources?.('../../lib/utils.ts', undefined)).toBe('./lib/utils.ts');
    expect(rewriteSources?.('./src/index.ts', undefined)).toBe('./src/index.ts');
    expect(rewriteSources?.('src/index.ts', undefined)).toBe('src/index.ts');
  });

  it('always sets metaFramework to nitro', () => {
    const options = getPluginOptions({ _metaOptions: { loggerPrefixOverride: '[custom]' } });

    expect(options._metaOptions?.telemetry?.metaFramework).toBe('nitro');
    expect(options._metaOptions?.loggerPrefixOverride).toBe('[custom]');
  });

  it('passes through sourcemaps.disable', () => {
    const options = getPluginOptions({ sourcemaps: { disable: 'disable-upload' } });

    expect(options.sourcemaps?.disable).toBe('disable-upload');
  });
});

describe('configureSourcemapSettings', () => {
  it('enables sourcemap generation on the config', () => {
    const config: NitroConfig = {};
    configureSourcemapSettings(config);

    expect(config.sourcemap).toBe(true);
  });

  it('forces sourcemap to true even when user set it to false', () => {
    const debugSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
    const config: NitroConfig = { sourcemap: false };
    configureSourcemapSettings(config);

    expect(config.sourcemap).toBe(true);
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('overriding this to `true`'));
    debugSpy.mockRestore();
  });

  it('keeps sourcemap true when user already set it', () => {
    const config: NitroConfig = { sourcemap: true };
    configureSourcemapSettings(config);

    expect(config.sourcemap).toBe(true);
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

  it('skips sourcemap config when disable is true', () => {
    const config: NitroConfig = { sourcemap: false };
    configureSourcemapSettings(config, { disable: true });

    expect(config.sourcemap).toBe(false);
  });
});

describe('setupSentryNitroModule', () => {
  it('enables tracing', () => {
    const config: NitroConfig = {};
    setupSentryNitroModule(config);

    // @ts-expect-error -- Nitro tracing config is not out yet
    expect(config.tracing).toBe(true);
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

  it('does not register hook when disable is true', () => {
    const hookFn = vi.fn();
    const nitro = {
      options: { dev: false, output: { serverDir: '/output/server' } },
      hooks: { hook: hookFn },
    } as any;

    setupSourceMaps(nitro, { disable: true });

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
