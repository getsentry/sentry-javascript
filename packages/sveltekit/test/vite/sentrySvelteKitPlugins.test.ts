import { vi } from 'vitest';

import { sentrySvelteKit } from '../../src/vite/sentryVitePlugins';
import * as sourceMaps from '../../src/vite/sourceMaps';

describe('sentryVite()', () => {
  it('returns an array of Vite plugins', () => {
    const plugins = sentrySvelteKit();
    expect(plugins).toBeInstanceOf(Array);
    expect(plugins).toHaveLength(1);
  });

  it('returns the custom sentry source maps plugin by default', () => {
    const plugins = sentrySvelteKit();
    const plugin = plugins[0];
    expect(plugin.name).toEqual('sentry-vite-plugin-custom');
  });

  it("doesn't return the custom sentry source maps plugin if autoUploadSourcemaps is `false`", () => {
    const plugins = sentrySvelteKit({ autoUploadSourceMaps: false });
    expect(plugins).toHaveLength(0);
  });

  it('passes user-specified vite pugin options to the custom sentry source maps plugin', () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeCustomSentryVitePlugin');
    const plugins = sentrySvelteKit({
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
