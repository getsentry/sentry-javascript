import { describe, expect, it } from 'vitest';
import type { NextConfigObject } from '../../src/config/types';
import { maybeSetClientTraceMetadataOption } from '../../src/config/withSentryConfig/getFinalConfigObjectUtils';

describe('maybeSetClientTraceMetadataOption', () => {
  it('adds baggage, sentry-trace, and sentry-cache-origin to clientTraceMetadata on supported Next.js versions', () => {
    const config: NextConfigObject = {};
    maybeSetClientTraceMetadataOption(config, '15.0.0');
    expect(config.experimental?.clientTraceMetadata).toEqual(['baggage', 'sentry-trace', 'sentry-cache-origin']);
  });

  it('preserves user-provided clientTraceMetadata entries', () => {
    const config: NextConfigObject = { experimental: { clientTraceMetadata: ['my-custom-key'] } };
    maybeSetClientTraceMetadataOption(config, '15.0.0');
    expect(config.experimental?.clientTraceMetadata).toEqual([
      'baggage',
      'sentry-trace',
      'sentry-cache-origin',
      'my-custom-key',
    ]);
  });

  it('enables trace meta tags when Cache Components is enabled', () => {
    // The server withholds the tags while it prerenders, see `nextSentryPropagator.ts`.
    const config: NextConfigObject = { cacheComponents: true };
    maybeSetClientTraceMetadataOption(config, '16.0.0');
    expect(config.experimental?.clientTraceMetadata).toEqual(['baggage', 'sentry-trace', 'sentry-cache-origin']);
  });
});
