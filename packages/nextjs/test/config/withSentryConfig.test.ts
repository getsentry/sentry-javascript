import { afterEach, describe, expect, it, vi } from 'vitest';
import * as util from '../../src/config/util';
import { DEFAULT_SERVER_EXTERNAL_PACKAGES } from '../../src/config/withSentryConfig';
import { defaultRuntimePhase, defaultsObject, exportedNextConfig, userNextConfig } from './fixtures';
import { materializeFinalNextConfig } from './testUtils';

describe('withSentryConfig', () => {
  it('includes expected properties', () => {
    const finalConfig = materializeFinalNextConfig(exportedNextConfig);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it('preserves unrelated next config options', () => {
    const finalConfig = materializeFinalNextConfig(exportedNextConfig);

    expect(finalConfig.publicRuntimeConfig).toEqual(userNextConfig.publicRuntimeConfig);
  });

  it("works when user's overall config is an object", () => {
    const finalConfig = materializeFinalNextConfig(exportedNextConfig);

    const { webpack, experimental, ...restOfFinalConfig } = finalConfig;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { webpack: _userWebpack, experimental: _userExperimental, ...restOfUserConfig } = userNextConfig;

    expect(restOfFinalConfig).toEqual(restOfUserConfig);
    expect(webpack).toBeInstanceOf(Function);
    expect(experimental).toEqual(
      expect.objectContaining({
        instrumentationHook: true,
        serverComponentsExternalPackages: expect.arrayContaining(DEFAULT_SERVER_EXTERNAL_PACKAGES),
      }),
    );
  });

  it("works when user's overall config is a function", () => {
    const exportedNextConfigFunction = () => userNextConfig;

    const finalConfig = materializeFinalNextConfig(exportedNextConfigFunction);

    const { webpack, experimental, ...restOfFinalConfig } = finalConfig;
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      webpack: _userWebpack,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      experimental: _userExperimental,
      ...restOfUserConfig
    } = exportedNextConfigFunction();

    expect(restOfFinalConfig).toEqual(restOfUserConfig);
    expect(webpack).toBeInstanceOf(Function);
    expect(experimental).toEqual(
      expect.objectContaining({
        instrumentationHook: true,
        serverComponentsExternalPackages: expect.arrayContaining(DEFAULT_SERVER_EXTERNAL_PACKAGES),
      }),
    );
  });

  it('correctly passes `phase` and `defaultConfig` through to functional `userNextConfig`', () => {
    const exportedNextConfigFunction = vi.fn().mockReturnValue(userNextConfig);

    materializeFinalNextConfig(exportedNextConfigFunction);

    expect(exportedNextConfigFunction).toHaveBeenCalledWith(defaultRuntimePhase, defaultsObject);
  });

  it('handles experimental build mode correctly', () => {
    const originalArgv = process.argv;
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      process.argv = [...originalArgv, '--experimental-build-mode'];
      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The Sentry Next.js SDK does not currently fully support next build --experimental-build-mode',
      );

      // Generate phase
      process.argv = [...process.argv, 'generate'];
      const generateConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(generateConfig).toEqual(exportedNextConfig);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.argv = originalArgv;
      consoleWarnSpy.mockRestore();
    }
  });

  describe('server packages configuration', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('uses serverExternalPackages for Next.js 15+', () => {
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');
      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.serverExternalPackages).toBeDefined();
      expect(finalConfig.serverExternalPackages).toEqual(expect.arrayContaining(DEFAULT_SERVER_EXTERNAL_PACKAGES));
      expect(finalConfig.experimental?.serverComponentsExternalPackages).toBeUndefined();
    });

    it('uses experimental.serverComponentsExternalPackages for Next.js < 15', () => {
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('14.0.0');
      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.serverExternalPackages).toBeUndefined();
      expect(finalConfig.experimental?.serverComponentsExternalPackages).toBeDefined();
      expect(finalConfig.experimental?.serverComponentsExternalPackages).toEqual(
        expect.arrayContaining(DEFAULT_SERVER_EXTERNAL_PACKAGES),
      );
    });

    it('preserves existing packages in both versions', () => {
      const existingPackages = ['@some/existing-package'];

      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');
      const config15 = materializeFinalNextConfig({
        ...exportedNextConfig,
        serverExternalPackages: existingPackages,
      });
      expect(config15.serverExternalPackages).toEqual(
        expect.arrayContaining([...existingPackages, ...DEFAULT_SERVER_EXTERNAL_PACKAGES]),
      );

      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('14.0.0');
      const config14 = materializeFinalNextConfig({
        ...exportedNextConfig,
        experimental: {
          serverComponentsExternalPackages: existingPackages,
        },
      });
      expect(config14.experimental?.serverComponentsExternalPackages).toEqual(
        expect.arrayContaining([...existingPackages, ...DEFAULT_SERVER_EXTERNAL_PACKAGES]),
      );
    });
  });

  describe('webpack configuration behavior', () => {
    const originalTurbopack = process.env.TURBOPACK;

    afterEach(() => {
      vi.restoreAllMocks();
      process.env.TURBOPACK = originalTurbopack;
    });

    it('uses constructed webpack function when Turbopack is disabled and disableSentryWebpackConfig is false/undefined', () => {
      delete process.env.TURBOPACK;

      // default behavior
      const finalConfigUndefined = materializeFinalNextConfig(exportedNextConfig);
      expect(finalConfigUndefined.webpack).toBeInstanceOf(Function);

      const sentryOptions = {
        disableSentryWebpackConfig: false,
      };
      const finalConfigFalse = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);
      expect(finalConfigFalse.webpack).toBeInstanceOf(Function);
    });

    it('preserves original webpack config when disableSentryWebpackConfig is true (regardless of Turbopack)', () => {
      const originalWebpackFunction = vi.fn();
      const configWithWebpack = {
        ...exportedNextConfig,
        webpack: originalWebpackFunction,
      };

      const sentryOptions = {
        disableSentryWebpackConfig: true,
      };

      delete process.env.TURBOPACK;
      const finalConfigWithoutTurbopack = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);
      expect(finalConfigWithoutTurbopack.webpack).toBe(originalWebpackFunction);

      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');
      const finalConfigWithTurbopack = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);
      expect(finalConfigWithTurbopack.webpack).toBe(originalWebpackFunction);
    });

    it('preserves original webpack config when Turbopack is enabled (ignores disableSentryWebpackConfig flag)', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const originalWebpackFunction = vi.fn();
      const configWithWebpack = {
        ...exportedNextConfig,
        webpack: originalWebpackFunction,
      };

      const sentryOptionsWithFalse = {
        disableSentryWebpackConfig: false,
      };
      const finalConfigWithFalse = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptionsWithFalse);
      expect(finalConfigWithFalse.webpack).toBe(originalWebpackFunction);

      const finalConfigWithUndefined = materializeFinalNextConfig(configWithWebpack);
      expect(finalConfigWithUndefined.webpack).toBe(originalWebpackFunction);

      const sentryOptionsWithTrue = {
        disableSentryWebpackConfig: true,
      };
      const finalConfigWithTrue = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptionsWithTrue);
      expect(finalConfigWithTrue.webpack).toBe(originalWebpackFunction);
    });

    it('preserves original webpack config when Turbopack is enabled and disableSentryWebpackConfig is true', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const sentryOptions = {
        disableSentryWebpackConfig: true,
      };

      const originalWebpackFunction = vi.fn();
      const configWithWebpack = {
        ...exportedNextConfig,
        webpack: originalWebpackFunction,
      };

      const finalConfig = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);

      expect(finalConfig.webpack).toBe(originalWebpackFunction);
    });

    it('preserves undefined webpack when Turbopack is enabled, disableSentryWebpackConfig is true, and no original webpack config exists', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const sentryOptions = {
        disableSentryWebpackConfig: true,
      };

      const configWithoutWebpack = {
        ...exportedNextConfig,
      };
      delete configWithoutWebpack.webpack;

      const finalConfig = materializeFinalNextConfig(configWithoutWebpack, undefined, sentryOptions);

      expect(finalConfig.webpack).toBeUndefined();
    });

    it('includes turbopack config when Turbopack is supported and enabled', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeDefined();
    });

    it('does not include turbopack config when Turbopack is not enabled', () => {
      delete process.env.TURBOPACK;

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
    });
  });

  describe('turbopack sourcemap configuration', () => {
    const originalTurbopack = process.env.TURBOPACK;

    afterEach(() => {
      vi.restoreAllMocks();
      process.env.TURBOPACK = originalTurbopack;
    });

    it('enables productionBrowserSourceMaps for supported turbopack builds when sourcemaps are not disabled', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.productionBrowserSourceMaps).toBe(true);
    });

    it('does not enable productionBrowserSourceMaps when sourcemaps are disabled', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.productionBrowserSourceMaps;

      const sentryOptions = {
        sourcemaps: {
          disable: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
    });

    it('does not enable productionBrowserSourceMaps when turbopack is not enabled', () => {
      delete process.env.TURBOPACK;

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.productionBrowserSourceMaps;

      const finalConfig = materializeFinalNextConfig(cleanConfig);

      expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
    });

    it('does not enable productionBrowserSourceMaps when turbopack version is not supported', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.2.0'); // unsupported version

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.productionBrowserSourceMaps;

      const finalConfig = materializeFinalNextConfig(cleanConfig);

      expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
    });

    it('preserves user-configured productionBrowserSourceMaps setting', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const configWithSourceMaps = {
        ...exportedNextConfig,
        productionBrowserSourceMaps: false, // user explicitly disabled
      };

      const finalConfig = materializeFinalNextConfig(configWithSourceMaps);

      expect(finalConfig.productionBrowserSourceMaps).toBe(false);
    });

    it('preserves user-configured productionBrowserSourceMaps: true setting', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const configWithSourceMaps = {
        ...exportedNextConfig,
        productionBrowserSourceMaps: true, // user explicitly enabled
      };

      const sentryOptions = {
        sourcemaps: {
          disable: true, // Sentry disabled, but user wants Next.js sourcemaps
        },
      };

      const finalConfig = materializeFinalNextConfig(configWithSourceMaps, undefined, sentryOptions);

      expect(finalConfig.productionBrowserSourceMaps).toBe(true);
    });

    it('automatically enables deleteSourcemapsAfterUpload for turbopack builds when not explicitly set', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      // Use a clean config without productionBrowserSourceMaps to ensure it gets auto-enabled
      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.productionBrowserSourceMaps;

      const sentryOptions = {
        sourcemaps: {}, // no deleteSourcemapsAfterUpload setting
      };

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      // Both productionBrowserSourceMaps and deleteSourcemapsAfterUpload should be enabled
      expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      expect(sentryOptions.sourcemaps).toHaveProperty('deleteSourcemapsAfterUpload', true);
    });

    it('preserves explicitly configured deleteSourcemapsAfterUpload setting', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const sentryOptions = {
        sourcemaps: {
          deleteSourcemapsAfterUpload: false, // user wants to keep sourcemaps
        },
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(sentryOptions.sourcemaps.deleteSourcemapsAfterUpload).toBe(false);
    });

    it('does not modify deleteSourcemapsAfterUpload when sourcemaps are disabled', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const sentryOptions = {
        sourcemaps: {
          disable: true,
        },
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(sentryOptions.sourcemaps).not.toHaveProperty('deleteSourcemapsAfterUpload');
    });

    it('does not enable deleteSourcemapsAfterUpload when user pre-configured productionBrowserSourceMaps: true', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const configWithSourceMapsPreEnabled = {
        ...exportedNextConfig,
        productionBrowserSourceMaps: true, // User already enabled
      };

      const sentryOptions = {
        sourcemaps: {}, // no explicit deleteSourcemapsAfterUpload setting
      };

      materializeFinalNextConfig(configWithSourceMapsPreEnabled, undefined, sentryOptions);

      // Should NOT automatically enable deletion because productionBrowserSourceMaps was already set by user
      expect(sentryOptions.sourcemaps).not.toHaveProperty('deleteSourcemapsAfterUpload');
    });

    it('does not enable sourcemaps or deletion when user explicitly sets productionBrowserSourceMaps: false', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

      const configWithSourceMapsDisabled = {
        ...exportedNextConfig,
        productionBrowserSourceMaps: false, // User explicitly disabled
      };

      const sentryOptions = {
        sourcemaps: {}, // no explicit deleteSourcemapsAfterUpload setting
      };

      const finalConfig = materializeFinalNextConfig(configWithSourceMapsDisabled, undefined, sentryOptions);

      // Should NOT modify productionBrowserSourceMaps or enable deletion when user explicitly set to false
      expect(finalConfig.productionBrowserSourceMaps).toBe(false);
      expect(sentryOptions.sourcemaps).not.toHaveProperty('deleteSourcemapsAfterUpload');
    });

    it('logs correct message when enabling sourcemaps for turbopack', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.productionBrowserSourceMaps;

      const sentryOptions = {
        debug: true,
      };

      materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] Automatically enabling browser source map generation for turbopack build.',
      );

      consoleSpy.mockRestore();
    });

    it('warns about automatic sourcemap deletion for turbopack builds', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Use a clean config without productionBrowserSourceMaps to trigger automatic enablement
      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.productionBrowserSourceMaps;

      const sentryOptions = {
        debug: true,
        sourcemaps: {}, // triggers automatic deletion
      };

      materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] Source maps will be automatically deleted after being uploaded to Sentry. If you want to keep the source maps, set the `sourcemaps.deleteSourcemapsAfterUpload` option to false in `withSentryConfig()`. If you do not want to generate and upload sourcemaps at all, set the `sourcemaps.disable` option to true.',
      );

      consoleWarnSpy.mockRestore();
    });

    describe('version compatibility', () => {
      it('enables sourcemaps for Next.js 15.3.0', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('enables sourcemaps for Next.js 15.4.0', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('enables sourcemaps for Next.js 16.0.0', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('does not enable sourcemaps for Next.js 15.2.9', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.2.9');

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const finalConfig = materializeFinalNextConfig(cleanConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
      });

      it('enables sourcemaps for supported canary versions', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0-canary.28');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('does not enable sourcemaps for unsupported canary versions', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0-canary.27');

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const finalConfig = materializeFinalNextConfig(cleanConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('handles undefined sourcemaps option', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        const sentryOptions = {}; // no sourcemaps property

        const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('handles empty sourcemaps object', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        // Use a clean config without productionBrowserSourceMaps to trigger automatic enablement
        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const sentryOptions = {
          sourcemaps: {}, // empty object
        };

        materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

        expect(sentryOptions.sourcemaps).toHaveProperty('deleteSourcemapsAfterUpload', true);
      });

      it('works when TURBOPACK env var is truthy string', () => {
        process.env.TURBOPACK = 'true';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('does not enable sourcemaps when TURBOPACK env var is falsy', () => {
        process.env.TURBOPACK = '';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const finalConfig = materializeFinalNextConfig(cleanConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
      });

      it('works correctly with tunnel route configuration', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        // Use a clean config without productionBrowserSourceMaps to trigger automatic enablement
        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const sentryOptions = {
          tunnelRoute: '/custom-tunnel',
          sourcemaps: {},
        };

        const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
        expect(sentryOptions.sourcemaps).toHaveProperty('deleteSourcemapsAfterUpload', true);
        expect(finalConfig.rewrites).toBeInstanceOf(Function);
      });

      it('works correctly with custom release configuration', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        // Clear environment variable to test custom release name
        const originalSentryRelease = process.env.SENTRY_RELEASE;
        delete process.env.SENTRY_RELEASE;

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.env;
        delete cleanConfig.productionBrowserSourceMaps; // Ensure it gets auto-enabled

        const sentryOptions = {
          release: {
            name: 'custom-release-1.0.0',
          },
          sourcemaps: {},
        };

        const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
        expect(sentryOptions.sourcemaps).toHaveProperty('deleteSourcemapsAfterUpload', true);
        expect(finalConfig.env).toHaveProperty('_sentryRelease', 'custom-release-1.0.0');

        // Restore original env var
        if (originalSentryRelease) {
          process.env.SENTRY_RELEASE = originalSentryRelease;
        }
      });

      it('does not interfere with other Next.js configuration options', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        const configWithOtherOptions = {
          ...exportedNextConfig,
          assetPrefix: 'https://cdn.example.com',
          basePath: '/app',
          distDir: 'custom-dist',
        };

        const finalConfig = materializeFinalNextConfig(configWithOtherOptions);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
        expect(finalConfig.assetPrefix).toBe('https://cdn.example.com');
        expect(finalConfig.basePath).toBe('/app');
        expect(finalConfig.distDir).toBe('custom-dist');
      });

      it('works correctly when turbopack config already exists', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.0');

        const configWithTurbopack = {
          ...exportedNextConfig,
          turbopack: {
            resolveAlias: {
              '@': './src',
            },
          },
        };

        const finalConfig = materializeFinalNextConfig(configWithTurbopack);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
        expect(finalConfig.turbopack).toBeDefined();
        expect(finalConfig.turbopack?.resolveAlias).toEqual({ '@': './src' });
      });
    });
  });

  describe('release injection behavior', () => {
    afterEach(() => {
      vi.restoreAllMocks();

      // clear env to avoid leaking env vars from fixtures
      delete exportedNextConfig.env;
      delete process.env.SENTRY_RELEASE;
    });

    it('does not inject release when create is false', () => {
      const sentryOptions = {
        release: {
          create: false,
        },
      };

      // clear env to avoid leaking env vars from fixtures
      delete exportedNextConfig.env;

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      // Should not inject release into environment when create is false
      expect(finalConfig.env).not.toHaveProperty('_sentryRelease');
    });

    it('injects release when create is true (default)', () => {
      const sentryOptions = {
        release: {
          create: true,
          name: 'test-release@1.0.0',
        },
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      // Should inject release into environment when create is true
      expect(finalConfig.env).toHaveProperty('_sentryRelease', 'test-release@1.0.0');
    });

    it('injects release with explicit name', () => {
      const sentryOptions = {
        release: {
          name: 'custom-release-v2.1.0',
        },
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      // Should inject the explicit release name
      expect(finalConfig.env).toHaveProperty('_sentryRelease', 'custom-release-v2.1.0');
    });

    it('falls back to SENTRY_RELEASE environment variable when no explicit name provided', () => {
      process.env.SENTRY_RELEASE = 'env-release-1.5.0';

      const sentryOptions = {
        release: {
          create: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.env).toHaveProperty('_sentryRelease', 'env-release-1.5.0');
    });
  });

  describe('runAfterProductionCompile hook integration', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sets up runAfterProductionCompile hook when experimental flag is enabled and version is supported', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });

    it('does not set up hook when experimental flag is disabled', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: false,
        },
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('does not set up hook when Next.js version is not supported', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('preserves existing runAfterProductionCompile hook using proxy', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const originalHook = vi.fn().mockResolvedValue(undefined);
      const configWithExistingHook = {
        ...exportedNextConfig,
        compiler: {
          runAfterProductionCompile: originalHook,
        },
      };

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(configWithExistingHook, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
      expect(finalConfig.compiler?.runAfterProductionCompile).not.toBe(originalHook);
    });

    it('warns when existing runAfterProductionCompile is not a function', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const configWithInvalidHook = {
        ...exportedNextConfig,
        compiler: {
          runAfterProductionCompile: 'invalid-hook' as any,
        },
      };

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      materializeFinalNextConfig(configWithInvalidHook, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `compiler.runAfterProductionCompile` option is not a function. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('creates compiler object when it does not exist', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const configWithoutCompiler = { ...exportedNextConfig };
      delete configWithoutCompiler.compiler;

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(configWithoutCompiler, undefined, sentryOptions);

      expect(finalConfig.compiler).toBeDefined();
      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });

    it('works with turbopack builds when TURBOPACK env is set', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);

      delete process.env.TURBOPACK;
    });

    it('works with webpack builds when TURBOPACK env is not set', () => {
      delete process.env.TURBOPACK;
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });
  });

  describe('experimental flag handling', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('respects useRunAfterProductionCompileHook: true', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });

    it('respects useRunAfterProductionCompileHook: false', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: false,
        },
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('does not set up hook when experimental flag is undefined', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          // useRunAfterProductionCompileHook not specified
        },
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('does not set up hook when _experimental is undefined', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        // no _experimental property
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('combines experimental flag with other configurations correctly', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        _experimental: {
          useRunAfterProductionCompileHook: true,
        },
        sourcemaps: {},
        tunnelRoute: '/tunnel',
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      // Should have both turbopack sourcemap config AND runAfterProductionCompile hook
      expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
      expect(finalConfig.rewrites).toBeInstanceOf(Function);

      delete process.env.TURBOPACK;
    });
  });
});
