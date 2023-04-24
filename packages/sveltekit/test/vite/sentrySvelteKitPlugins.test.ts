import { vi } from 'vitest';

import { sentrySvelteKit } from '../../src/vite/sentryVitePlugins';
import * as sourceMaps from '../../src/vite/sourceMaps';

describe('sentryVite()', () => {
  it('returns an array of Vite plugins', async () => {
    const plugins = await sentrySvelteKit();
    expect(plugins).toBeInstanceOf(Array);
    expect(plugins).toHaveLength(1);
  });

  it('returns the custom sentry source maps plugin by default', async () => {
    const plugins = await sentrySvelteKit();
    const plugin = plugins[0];
    expect(plugin.name).toEqual('sentry-vite-plugin-custom');
  });

  it("doesn't return the custom sentry source maps plugin if autoUploadSourcemaps is `false`", async () => {
    const plugins = await sentrySvelteKit({ autoUploadSourceMaps: false });
    expect(plugins).toHaveLength(0);
  });

  it('passes user-specified vite pugin options to the custom sentry source maps plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugin');
    const plugins = await sentrySvelteKit({
      debug: true,
      sourceMapsUploadOptions: {
        include: ['foo.js'],
        ignore: ['bar.js'],
      },
    });
    const plugin = plugins[0];
    expect(plugin.name).toEqual('sentry-vite-plugin-custom');
    expect(makePluginSpy).toHaveBeenCalledWith({
      debug: true,
      ignore: ['bar.js'],
      include: ['foo.js'],
    });
  });
});
