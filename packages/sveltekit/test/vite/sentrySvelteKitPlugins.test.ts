import { vi } from 'vitest';

import * as autoInstrument from '../../src/vite/autoInstrument';
import { sentrySvelteKit } from '../../src/vite/sentryVitePlugins';
import * as sourceMaps from '../../src/vite/sourceMaps';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    // @ts-ignore this exists, I promise!
    ...actual,
    promises: {
      // @ts-ignore this also exists, I promise!
      ...actual.promises,
      readFile: vi.fn().mockReturnValue('foo'),
    },
  };
});

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

describe('sentryVite()', () => {
  it('returns an array of Vite plugins', async () => {
    const plugins = await sentrySvelteKit();

    expect(plugins).toBeInstanceOf(Array);
    expect(plugins).toHaveLength(2);
  });

  it('returns the custom sentry source maps plugin and the auto-instrument plugin by default', async () => {
    const plugins = await sentrySvelteKit();
    const instrumentPlugin = plugins[0];
    const sourceMapsPlugin = plugins[1];
    expect(instrumentPlugin.name).toEqual('sentry-auto-instrumentation');
    expect(sourceMapsPlugin.name).toEqual('sentry-upload-source-maps');
  });

  it("doesn't return the custom sentry source maps plugin if autoUploadSourcemaps is `false`", async () => {
    const plugins = await sentrySvelteKit({ autoUploadSourceMaps: false });
    expect(plugins).toHaveLength(1);
  });

  it("doesn't return the custom sentry source maps plugin if `NODE_ENV` is development", async () => {
    const previousEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    const plugins = await sentrySvelteKit({ autoUploadSourceMaps: true, autoInstrument: true });
    const instrumentPlugin = plugins[0];

    expect(plugins).toHaveLength(1);
    expect(instrumentPlugin.name).toEqual('sentry-auto-instrumentation');

    process.env.NODE_ENV = previousEnv;
  });

  it("doesn't return the auto instrument plugin if autoInstrument is `false`", async () => {
    const plugins = await sentrySvelteKit({ autoInstrument: false });
    expect(plugins).toHaveLength(1);
  });

  it('passes user-specified vite pugin options to the custom sentry source maps plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugin');
    const plugins = await sentrySvelteKit({
      debug: true,
      sourceMapsUploadOptions: {
        include: ['foo.js'],
        ignore: ['bar.js'],
      },
      autoInstrument: false,
    });
    const plugin = plugins[0];

    expect(plugin.name).toEqual('sentry-upload-source-maps');
    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      ignore: ['bar.js'],
      include: ['foo.js'],
    });
  });

  it('passes user-specified options to the auto instrument plugin', async () => {
    const makePluginSpy = vi.spyOn(autoInstrument, 'makeAutoInstrumentationPlugin');
    const plugins = await sentrySvelteKit({
      debug: true,
      autoInstrument: {
        load: true,
        serverLoad: false,
      },
      // just to ignore the source maps plugin:
      autoUploadSourceMaps: false,
    });
    const plugin = plugins[0];

    expect(plugin.name).toEqual('sentry-auto-instrumentation');
    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      load: true,
      serverLoad: false,
    });
  });
});
