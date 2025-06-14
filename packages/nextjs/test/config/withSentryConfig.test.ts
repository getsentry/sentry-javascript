import { describe, expect, it, vi } from 'vitest';
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

    expect(finalConfig).toEqual(
      expect.objectContaining({
        ...userNextConfig,
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
      }),
    );
  });

  it("works when user's overall config is a function", () => {
    const exportedNextConfigFunction = () => userNextConfig;

    const finalConfig = materializeFinalNextConfig(exportedNextConfigFunction);

    expect(finalConfig).toEqual(
      expect.objectContaining({
        ...exportedNextConfigFunction(),
        webpack: expect.any(Function), // `webpack` is tested specifically elsewhere
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
});
