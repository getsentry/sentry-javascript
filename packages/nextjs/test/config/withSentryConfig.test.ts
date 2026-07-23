import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      const finalConfigWithTurbopack = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);
      expect(finalConfigWithTurbopack.webpack).toBe(originalWebpackFunction);
    });

    it('preserves original webpack config when Turbopack is enabled (ignores disableSentryWebpackConfig flag)', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeDefined();
    });

    it('does not include turbopack config when Turbopack is not enabled', () => {
      delete process.env.TURBOPACK;

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
    });

    describe('webpack configuration options path', () => {
      afterEach(() => {
        delete process.env.TURBOPACK;
        vi.restoreAllMocks();
      });

      it('uses new webpack.disableSentryConfig option', () => {
        delete process.env.TURBOPACK;

        const originalWebpackFunction = vi.fn();
        const configWithWebpack = {
          ...exportedNextConfig,
          webpack: originalWebpackFunction,
        };

        const sentryOptions = {
          webpack: {
            disableSentryConfig: true,
          },
        };

        const finalConfig = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);
        expect(finalConfig.webpack).toBe(originalWebpackFunction);
      });

      it('new webpack path takes precedence over deprecated top-level options', () => {
        delete process.env.TURBOPACK;

        const originalWebpackFunction = vi.fn();
        const configWithWebpack = {
          ...exportedNextConfig,
          webpack: originalWebpackFunction,
        };

        // Both old and new paths set, new should win
        const sentryOptions = {
          disableSentryWebpackConfig: false, // deprecated - says enable
          webpack: {
            disableSentryConfig: true, // new - says disable
          },
        };

        const finalConfig = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);
        // Should preserve original webpack because new path disables it
        expect(finalConfig.webpack).toBe(originalWebpackFunction);
      });

      it('falls back to deprecated option when new path is not set', () => {
        delete process.env.TURBOPACK;

        const originalWebpackFunction = vi.fn();
        const configWithWebpack = {
          ...exportedNextConfig,
          webpack: originalWebpackFunction,
        };

        // Only deprecated path set
        const sentryOptions = {
          disableSentryWebpackConfig: true,
        };

        const finalConfig = materializeFinalNextConfig(configWithWebpack, undefined, sentryOptions);
        // Should preserve original webpack because deprecated option disables it
        expect(finalConfig.webpack).toBe(originalWebpackFunction);
      });

      it('merges webpack.treeshake.removeDebugLogging with deprecated disableLogger', () => {
        delete process.env.TURBOPACK;

        // New webpack.treeshake.removeDebugLogging should map to disableLogger internally
        const sentryOptionsNew = {
          webpack: {
            treeshake: {
              removeDebugLogging: true,
            },
          },
        };

        const sentryOptionsOld = {
          disableLogger: true,
        };

        // Both should work the same way internally (though we can't easily test the actual effect here)
        const finalConfigNew = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptionsNew);
        const finalConfigOld = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptionsOld);

        // Both should have webpack functions (not disabled)
        expect(finalConfigNew.webpack).toBeInstanceOf(Function);
        expect(finalConfigOld.webpack).toBeInstanceOf(Function);
      });
    });

    describe('deprecation warnings', () => {
      let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      });

      afterEach(() => {
        consoleWarnSpy.mockRestore();
        delete process.env.TURBOPACK;
        vi.restoreAllMocks();
      });

      it('warns when using deprecated top-level options', () => {
        delete process.env.TURBOPACK;

        const sentryOptions = {
          disableLogger: true,
        };

        materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[@sentry/nextjs] DEPRECATION WARNING: disableLogger is deprecated'),
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Use webpack.treeshake.removeDebugLogging instead'),
        );
      });

      it('adds a turbopack note when the deprecated option only applies to webpack', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');

        const sentryOptions = {
          disableLogger: true,
        };

        materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Use webpack.treeshake.removeDebugLogging instead. (Not supported with Turbopack.)'),
        );
      });

      it('does not warn when using new webpack path', () => {
        delete process.env.TURBOPACK;

        const sentryOptions = {
          webpack: {
            treeshake: {
              removeDebugLogging: true,
            },
          },
        };

        materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });

      it('warns even when new path is also set', () => {
        delete process.env.TURBOPACK;

        const sentryOptions = {
          disableLogger: true, // deprecated
          webpack: {
            treeshake: {
              removeDebugLogging: false, // new path takes precedence
            },
          },
        };

        materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        // Should warn because deprecated value is present
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[@sentry/nextjs] DEPRECATION WARNING: disableLogger is deprecated'),
        );
      });

      it('warns for multiple deprecated options at once', () => {
        delete process.env.TURBOPACK;

        const sentryOptions = {
          disableLogger: true,
          automaticVercelMonitors: false,
          excludeServerRoutes: ['/api/test'],
        };

        materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        // Should warn for all three deprecated options
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[@sentry/nextjs] DEPRECATION WARNING: disableLogger is deprecated'),
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[@sentry/nextjs] DEPRECATION WARNING: automaticVercelMonitors is deprecated'),
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[@sentry/nextjs] DEPRECATION WARNING: excludeServerRoutes is deprecated'),
        );
        expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('bundler detection', () => {
    const originalTurbopack = process.env.TURBOPACK;
    const originalArgv = process.argv;

    beforeEach(() => {
      process.argv = [...originalArgv];
      delete process.env.TURBOPACK;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      process.env.TURBOPACK = originalTurbopack;
      process.argv = originalArgv;
    });

    it('uses webpack config by default when TURBOPACK env var is not set', () => {
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
      expect(finalConfig.webpack).toBeInstanceOf(Function);
    });

    it('uses turbopack config when TURBOPACK env var is set (supported version)', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeDefined();
      expect(finalConfig.webpack).toBe(exportedNextConfig.webpack);
    });

    it('uses turbopack config when TURBOPACK env var is set (16.0.0)', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeDefined();
      expect(finalConfig.webpack).toBe(exportedNextConfig.webpack);
    });

    it('skips webpack config when TURBOPACK env var is set, even with unsupported version', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      // turbopack config won't be added when version is unsupported,
      // but webpack config should still be skipped
      expect(finalConfig.webpack).toBe(exportedNextConfig.webpack);
      expect(finalConfig.turbopack).toBeUndefined();
    });

    it('defaults to webpack when Next.js version cannot be determined and no TURBOPACK env var', () => {
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue(undefined);

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
      expect(finalConfig.webpack).toBeInstanceOf(Function);
    });

    it('uses turbopack when TURBOPACK env var is set even when version is undefined', () => {
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue(undefined);
      process.env.TURBOPACK = '1';

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.webpack).toBe(exportedNextConfig.webpack);

      expect(finalConfig.turbopack).toBeUndefined();
    });

    it('uses turbopack when TURBOPACK env var is truthy string', () => {
      process.env.TURBOPACK = 'true';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeDefined();
      expect(finalConfig.webpack).toBe(exportedNextConfig.webpack);
    });

    it('uses webpack when TURBOPACK env var is empty string', () => {
      process.env.TURBOPACK = '';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
      expect(finalConfig.webpack).toBeInstanceOf(Function);
    });

    it('uses webpack when TURBOPACK env var is false string', () => {
      process.env.TURBOPACK = 'false';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
      expect(finalConfig.webpack).toBeInstanceOf(Function);
    });

    it('handles malformed version strings gracefully', () => {
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('not.a.version');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.turbopack).toBeUndefined();
      expect(finalConfig.webpack).toBeInstanceOf(Function);
    });

    describe('warnings for unsupported turbopack usage', () => {
      let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      });

      it('warns when using turbopack on unsupported version', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');
        vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
        process.env.TURBOPACK = '1';

        materializeFinalNextConfig(exportedNextConfig);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('15.0.0'));
      });

      it('does not warn when using turbopack on supported version', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');
        vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);
        process.env.TURBOPACK = '1';

        materializeFinalNextConfig(exportedNextConfig);

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });

      it('does not warn when using webpack', () => {
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.0.0');
        vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);

        materializeFinalNextConfig(exportedNextConfig);

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });
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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const finalConfig = materializeFinalNextConfig(exportedNextConfig);

      expect(finalConfig.productionBrowserSourceMaps).toBe(true);
    });

    it('does not enable productionBrowserSourceMaps when sourcemaps are disabled', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

      const configWithSourceMaps = {
        ...exportedNextConfig,
        productionBrowserSourceMaps: false, // user explicitly disabled
      };

      const finalConfig = materializeFinalNextConfig(configWithSourceMaps);

      expect(finalConfig.productionBrowserSourceMaps).toBe(false);
    });

    it('preserves user-configured productionBrowserSourceMaps: true setting', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
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
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
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
      it('enables sourcemaps for Next.js 15.4.1', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('does not enable sourcemaps for Next.js 15.4.0', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0');

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const finalConfig = materializeFinalNextConfig(cleanConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
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
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1-canary.1');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('does not enable sourcemaps for unsupported canary versions', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0-canary.999');

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const finalConfig = materializeFinalNextConfig(cleanConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('handles undefined sourcemaps option', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

        const sentryOptions = {}; // no sourcemaps property

        const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('handles empty sourcemaps object', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

        const finalConfig = materializeFinalNextConfig(exportedNextConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBe(true);
      });

      it('does not enable sourcemaps when TURBOPACK env var is falsy', () => {
        process.env.TURBOPACK = '';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

        const cleanConfig = { ...exportedNextConfig };
        delete cleanConfig.productionBrowserSourceMaps;

        const finalConfig = materializeFinalNextConfig(cleanConfig);

        expect(finalConfig.productionBrowserSourceMaps).toBeUndefined();
      });

      it('works correctly with tunnel route configuration', () => {
        process.env.TURBOPACK = '1';
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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
        vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');

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

    it('sets up runAfterProductionCompile hook when flag is enabled and version is supported', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      // Use a clean copy of the config to avoid test interference
      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });

    it('does not set up hook when flag is disabled', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        useRunAfterProductionCompileHook: false,
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('does not set up hook when Next.js version is not supported', () => {
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
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
        useRunAfterProductionCompileHook: true,
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
        useRunAfterProductionCompileHook: true,
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
        useRunAfterProductionCompileHook: true,
      };

      const finalConfig = materializeFinalNextConfig(configWithoutCompiler, undefined, sentryOptions);

      expect(finalConfig.compiler).toBeDefined();
      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });

    it('defaults to true for turbopack when useRunAfterProductionCompileHook is not specified', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {}; // No useRunAfterProductionCompileHook specified

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);

      delete process.env.TURBOPACK;
    });

    it('defaults to false for webpack when useRunAfterProductionCompileHook is not specified', () => {
      delete process.env.TURBOPACK;
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {}; // No useRunAfterProductionCompileHook specified

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();
    });

    it('respects explicit false setting for turbopack', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        useRunAfterProductionCompileHook: false,
      };

      const cleanConfig = { ...exportedNextConfig };
      delete cleanConfig.compiler;

      const finalConfig = materializeFinalNextConfig(cleanConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeUndefined();

      delete process.env.TURBOPACK;
    });

    it('respects explicit true setting for webpack', () => {
      delete process.env.TURBOPACK;
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });

    it('works with turbopack builds when TURBOPACK env is set', () => {
      process.env.TURBOPACK = '1';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);

      delete process.env.TURBOPACK;
    });

    it('works with webpack builds when TURBOPACK env is not set', () => {
      delete process.env.TURBOPACK;
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(finalConfig.compiler?.runAfterProductionCompile).toBeInstanceOf(Function);
    });
  });

  describe('turbopack version compatibility warnings', () => {
    const originalTurbopack = process.env.TURBOPACK;
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      vi.restoreAllMocks();
      process.env.TURBOPACK = originalTurbopack;
      // @ts-expect-error - NODE_ENV is read-only in types but we need to restore it in tests
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('warns in development mode when Turbopack is enabled with unsupported Next.js version', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] WARNING: You are using the Sentry SDK with Turbopack. The Sentry SDK is compatible with Turbopack on Next.js version 15.4.1 or later. You are currently on 15.4.0. Please upgrade to a newer Next.js version to use the Sentry SDK with Turbopack.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('warns in production mode when Turbopack is enabled with unsupported Next.js version', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'production';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.9');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] WARNING: You are using the Sentry SDK with Turbopack. The Sentry SDK is compatible with Turbopack on Next.js version 15.4.1 or later. You are currently on 15.3.9. Please upgrade to a newer Next.js version to use the Sentry SDK with Turbopack.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when Turbopack is enabled with supported Next.js version', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when Turbopack is enabled with higher supported Next.js version', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'production';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.5.0');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when Turbopack is enabled with Next.js 16+', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when Turbopack is not enabled', () => {
      delete process.env.TURBOPACK;
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('warns even when Next.js version cannot be determined if Turbopack is unsupported', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue(undefined);
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      // Warning will still show because supportsProductionCompileHook returns false
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('You are currently on undefined'));

      consoleWarnSpy.mockRestore();
    });

    it('warns with correct version in message for edge case versions', () => {
      process.env.TURBOPACK = '1';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0-canary.15');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] WARNING: You are using the Sentry SDK with Turbopack. The Sentry SDK is compatible with Turbopack on Next.js version 15.4.1 or later. You are currently on 15.4.0-canary.15. Please upgrade to a newer Next.js version to use the Sentry SDK with Turbopack.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('handles falsy TURBOPACK environment variable', () => {
      process.env.TURBOPACK = '';
      // @ts-expect-error - NODE_ENV is read-only in types but we need to set it for testing
      process.env.NODE_ENV = 'development';
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      materializeFinalNextConfig(exportedNextConfig);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: You are using the Sentry SDK with Turbopack'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('useRunAfterProductionCompileHook warning logic', () => {
    const originalTurbopack = process.env.TURBOPACK;

    afterEach(() => {
      vi.restoreAllMocks();
      process.env.TURBOPACK = originalTurbopack;
    });

    it('warns when useRunAfterProductionCompileHook is enabled with unsupported Next.js version in webpack mode', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0'); // Unsupported version
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when useRunAfterProductionCompileHook is enabled with supported Next.js version in webpack mode', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1'); // Supported version
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when useRunAfterProductionCompileHook is disabled with unsupported Next.js version in webpack mode', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0'); // Unsupported version
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: false,
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when useRunAfterProductionCompileHook is undefined with unsupported Next.js version in webpack mode', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0'); // Unsupported version
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {}; // useRunAfterProductionCompileHook is undefined

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn when useRunAfterProductionCompileHook is enabled with unsupported Next.js version in turbopack mode', () => {
      process.env.TURBOPACK = '1'; // Ensure turbopack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0'); // Unsupported version
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      // Should not warn about useRunAfterProductionCompileHook incompatibility in turbopack mode
      // (though it may warn about turbopack version compatibility)
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('warns with different unsupported Next.js versions', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      // Test with 15.3.9
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.3.9');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockClear();

      // Test with 14.2.0
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('14.2.0');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockClear();

      // Test with canary version that's unsupported
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0-canary.42');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('does not warn with supported Next.js versions', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      // Test with 15.4.1
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockClear();

      // Test with 15.5.0
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.5.0');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockClear();

      // Test with 16.0.0
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('16.0.0');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockClear();

      // Test with supported canary version
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.1-canary.1');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(true);

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('The configured `useRunAfterProductionCompileHook` option is not compatible'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('handles edge case when Next.js version is undefined', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue(undefined);
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('handles edge case when Next.js version is empty string', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('');
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
      };

      materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      consoleWarnSpy.mockRestore();
    });

    it('works correctly with other sentry options present', () => {
      delete process.env.TURBOPACK; // Ensure webpack mode
      vi.spyOn(util, 'getNextjsVersion').mockReturnValue('15.4.0'); // Unsupported version
      vi.spyOn(util, 'supportsProductionCompileHook').mockReturnValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sentryOptions = {
        useRunAfterProductionCompileHook: true,
        debug: true,
        sourcemaps: {
          disable: false,
        },
        tunnelRoute: '/tunnel',
      };

      const finalConfig = materializeFinalNextConfig(exportedNextConfig, undefined, sentryOptions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[@sentry/nextjs] The configured `useRunAfterProductionCompileHook` option is not compatible with your current Next.js version. This option is only supported on Next.js version 15.4.1 or later. Will not run source map and release management logic.',
      );

      // Ensure other functionality still works (tunnel route creates rewrites function)
      expect(finalConfig.rewrites).toBeInstanceOf(Function);
      // Release name should be set (from git or environment)
      expect(finalConfig.env).toHaveProperty('_sentryRelease');

      consoleWarnSpy.mockRestore();
    });
  });
});
