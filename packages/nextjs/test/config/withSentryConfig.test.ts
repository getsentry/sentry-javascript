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
    const exportedNextConfigFunction = jest.fn().mockReturnValue(userNextConfig);

    materializeFinalNextConfig(exportedNextConfigFunction);

    expect(exportedNextConfigFunction).toHaveBeenCalledWith(defaultRuntimePhase, defaultsObject);
  });

  it('removes `sentry` property', () => {
    // It's unclear why we need this cast -
    const finalConfig = materializeFinalNextConfig({ ...exportedNextConfig, sentry: {} });
    // const finalConfig = materializeFinalNextConfig({ ...exportedNextConfig, sentry: {} } as ExportedNextConfig);

    // We have to check using `in` because TS knows it shouldn't be there and throws a type error if we try to access it
    // directly
    expect('sentry' in finalConfig).toBe(false);
  });

  describe('conditional use of `constructWebpackConfigFunction`', () => {
    // Note: In these tests, it would be nice to be able to spy on `constructWebpackConfigFunction` to see whether or
    // not it's called, but that sets up a catch-22: If you import or require the module to spy on the function, it gets
    // cached and the `require` call we care about (inside of `withSentryConfig`) doesn't actually run the module code.
    // Alternatively, if we call `jest.resetModules()` after setting up the spy, then the module code *is* run a second
    // time, but the spy belongs to the first instance of the module and therefore never registers a call. Thus we have
    // to test whether or not the file is required instead.

    it('imports from `webpack.ts` if build phase is "phase-production-build"', () => {
      jest.isolateModules(() => {
        // In case this is still set from elsewhere, reset it
        delete (global as any)._sentryWebpackModuleLoaded;

        materializeFinalNextConfig(exportedNextConfig, undefined, 'phase-production-build');

        expect((global as any)._sentryWebpackModuleLoaded).toBe(true);
      });
    });

    it('imports from `webpack.ts` if build phase is "phase-development-server"', () => {
      jest.isolateModules(() => {
        // In case this is still set from elsewhere, reset it
        delete (global as any)._sentryWebpackModuleLoaded;

        materializeFinalNextConfig(exportedNextConfig, undefined, 'phase-production-build');

        expect((global as any)._sentryWebpackModuleLoaded).toBe(true);
      });
    });

    it('Doesn\'t import from `webpack.ts` if build phase is "phase-production-server"', () => {
      jest.isolateModules(() => {
        // In case this is still set from elsewhere, reset it
        delete (global as any)._sentryWebpackModuleLoaded;

        materializeFinalNextConfig(exportedNextConfig, undefined, 'phase-production-server');

        expect((global as any)._sentryWebpackModuleLoaded).toBeUndefined();
      });
    });
  });
});
