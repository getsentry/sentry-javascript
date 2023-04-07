import { vi } from 'vitest';

import { sentrySvelteKitPlugin } from './../../src/vite/sentrySvelteKitPlugin';
import * as utils from './../../src/vite/utils';

describe('sentrySvelteKitPlugin', () => {
  it('returns a Vite plugin with name, enforce, and config hook', () => {
    const plugin = sentrySvelteKitPlugin();
    expect(plugin).toHaveProperty('name');
    expect(plugin).toHaveProperty('enforce');
    expect(plugin).toHaveProperty('config');
    expect(plugin.name).toEqual('sentry-sveltekit');
    expect(plugin.enforce).toEqual('pre');
  });

  describe('config hook', () => {
    const hasSentryInitFilesSpy = vi.spyOn(utils, 'hasSentryInitFiles').mockReturnValue(true);

    beforeEach(() => {
      hasSentryInitFilesSpy.mockClear();
    });

    it('adds the injectInitPlugin and adjusts the dev server config if init config files exist', () => {
      const plugin = sentrySvelteKitPlugin();
      const originalConfig = {};

      // @ts-ignore - plugin.config exists and is callable
      const modifiedConfig = plugin.config(originalConfig);

      expect(modifiedConfig).toEqual({
        plugins: [
          {
            enforce: 'pre',
            name: 'sentry-init-injection-plugin',
            transform: expect.any(Function),
          },
        ],
        server: {
          fs: {
            allow: ['.'],
          },
        },
      });
      expect(hasSentryInitFilesSpy).toHaveBeenCalledTimes(1);
    });

    it('merges user-defined options with Sentry-specifc ones', () => {
      const plugin = sentrySvelteKitPlugin();
      const originalConfig = {
        test: {
          include: ['src/**/*.{test,spec}.{js,ts}'],
        },
        build: {
          sourcemap: 'css',
        },
        plugins: [{ name: 'some plugin' }],
        server: {
          fs: {
            allow: ['./build/**/*.{js}'],
          },
        },
      };

      // @ts-ignore - plugin.config exists and is callable
      const modifiedConfig = plugin.config(originalConfig);

      expect(modifiedConfig).toEqual({
        test: {
          include: ['src/**/*.{test,spec}.{js,ts}'],
        },
        build: {
          sourcemap: 'css',
        },
        plugins: [
          {
            enforce: 'pre',
            name: 'sentry-init-injection-plugin',
            transform: expect.any(Function),
          },
          { name: 'some plugin' },
        ],
        server: {
          fs: {
            allow: ['./build/**/*.{js}', '.'],
          },
        },
      });
      expect(hasSentryInitFilesSpy).toHaveBeenCalledTimes(1);
    });

    it("doesn't add the injectInitPlugin if init config files don't exist", () => {
      hasSentryInitFilesSpy.mockReturnValue(false);
      const plugin = sentrySvelteKitPlugin();
      const originalConfig = {
        plugins: [{ name: 'some plugin' }],
      };

      // @ts-ignore - plugin.config exists and is callable
      const modifiedConfig = plugin.config(originalConfig);

      expect(modifiedConfig).toEqual({
        plugins: [{ name: 'some plugin' }],
        server: {},
      });
      expect(hasSentryInitFilesSpy).toHaveBeenCalledTimes(1);
    });
  });
});
