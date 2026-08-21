import { describe, expect, it } from 'vitest';
import { withChannelInjectionExclusionDefault } from '../../src/bundler-plugin/common';

describe('withChannelInjectionExclusionDefault', () => {
  it('defaults excludeChannelInjection to true when build-time instrumentation is enabled (the default)', () => {
    expect(withChannelInjectionExclusionDefault(undefined)).toEqual({
      bundleSizeOptimizations: { excludeChannelInjection: true },
    });

    expect(withChannelInjectionExclusionDefault({ org: 'my-org' })).toEqual({
      org: 'my-org',
      bundleSizeOptimizations: { excludeChannelInjection: true },
    });
  });

  it('does not set the default when build-time instrumentation is disabled', () => {
    expect(withChannelInjectionExclusionDefault({ buildTimeInstrumentation: false })).toEqual({
      buildTimeInstrumentation: false,
    });
  });

  it('lets the user override excludeChannelInjection', () => {
    expect(
      withChannelInjectionExclusionDefault({ bundleSizeOptimizations: { excludeChannelInjection: false } }),
    ).toEqual({ bundleSizeOptimizations: { excludeChannelInjection: false } });
  });

  it('preserves other bundleSizeOptimizations while adding the default', () => {
    expect(withChannelInjectionExclusionDefault({ bundleSizeOptimizations: { excludeTracing: true } })).toEqual({
      bundleSizeOptimizations: { excludeChannelInjection: true, excludeTracing: true },
    });
  });
});
