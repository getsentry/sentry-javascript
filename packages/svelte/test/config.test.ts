import { withSentryConfig } from '../src/config';
import { componentTrackingPreprocessor, FIRST_PASS_COMPONENT_TRACKING_PREPROC_ID } from '../src/preprocessors';
import type { SentryPreprocessorGroup, SentrySvelteConfigOptions, SvelteConfig } from '../src/types';

describe('withSentryConfig', () => {
  it.each([
    [
      'no preprocessors specified',
      {
        compilerOptions: {
          enableSourcemap: true,
        },
      },
    ],
    [
      'a single preprocessor specified',
      {
        compilerOptions: {
          enableSourcemap: true,
        },
        preprocess: {},
      },
    ],
    [
      'an array of preprocessors specified',
      {
        compilerOptions: {
          enableSourcemap: true,
        },
        preprocess: [{}, {}, {}],
      },
    ],
  ])('adds our preprocessors by default to the provided svelte config with %s', (_, originalConfig: SvelteConfig) => {
    const wrappedConfig = withSentryConfig(originalConfig);
    const originalPreprocs = originalConfig.preprocess;
    const originalNumberOfPreprocs = originalPreprocs
      ? Array.isArray(originalPreprocs)
        ? originalPreprocs.length
        : 1
      : 0;

    expect(Array.isArray(wrappedConfig.preprocess)).toBe(true);
    expect(wrappedConfig).toEqual({ ...originalConfig, preprocess: expect.any(Array) });
    expect(wrappedConfig.preprocess).toHaveLength(originalNumberOfPreprocs + 1);
    expect((wrappedConfig.preprocess as SentryPreprocessorGroup[])[0].sentryId).toEqual(
      FIRST_PASS_COMPONENT_TRACKING_PREPROC_ID,
    );
  });

  it("doesn't add Sentry preprocessors that were already added by the users", () => {
    // eslint-disable-next-line deprecation/deprecation
    const sentryPreproc = componentTrackingPreprocessor();
    const originalConfig = {
      compilerOptions: {
        enableSourcemap: true,
      },
      preprocess: sentryPreproc,
    };

    const wrappedConfig = withSentryConfig(originalConfig);

    expect(wrappedConfig).toEqual({ ...originalConfig, preprocess: [sentryPreproc] });
  });

  it('handles multiple wraps correctly by only adding our preprocessors once', () => {
    const originalConfig = {
      compilerOptions: {
        enableSourcemap: true,
      },
    };

    const wrappedConfig = withSentryConfig(withSentryConfig(withSentryConfig(originalConfig)));

    expect(wrappedConfig).toEqual({ ...originalConfig, preprocess: expect.any(Array) });
    expect(wrappedConfig.preprocess).toHaveLength(1);
  });

  it("doesn't add component tracking preprocessors if the feature is deactivated", () => {
    const originalConfig = {
      compilerOptions: {
        enableSourcemap: true,
      },
      preprocess: [{}],
    };

    const sentryOptions: SentrySvelteConfigOptions = { componentTracking: { trackComponents: false } };
    const wrappedConfig = withSentryConfig(originalConfig, sentryOptions);

    expect(wrappedConfig).toEqual(originalConfig);
  });
});
