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
});
