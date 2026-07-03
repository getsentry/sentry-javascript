import { describe, expect, it } from 'vitest';
import type { NextConfigObject } from '../../src/config/types';
import { maybeSetClientTraceMetadataOption } from '../../src/config/withSentryConfig/getFinalConfigObjectUtils';

describe('maybeSetClientTraceMetadataOption', () => {
  it('adds sentry-trace and baggage to clientTraceMetadata on supported Next.js versions', () => {
    const config: NextConfigObject = {};
    maybeSetClientTraceMetadataOption(config, '15.0.0');
    expect(config.experimental?.clientTraceMetadata).toEqual(['baggage', 'sentry-trace']);
  });

  it('preserves user-provided clientTraceMetadata entries', () => {
    const config: NextConfigObject = { experimental: { clientTraceMetadata: ['my-custom-key'] } };
    maybeSetClientTraceMetadataOption(config, '15.0.0');
    expect(config.experimental?.clientTraceMetadata).toEqual(['baggage', 'sentry-trace', 'my-custom-key']);
  });

  it('does NOT enable trace meta tags when Cache Components is enabled', () => {
    // With Cache Components, the shell is prerendered/detached from the request, so the meta-tag
    // trace would be stale. The SDK skips enabling `clientTraceMetadata` so the browser pageload
    // starts a fresh trace instead of stitching onto a stale trace.
    const config: NextConfigObject = { cacheComponents: true };
    maybeSetClientTraceMetadataOption(config, '16.0.0');
    expect(config.experimental?.clientTraceMetadata).toBeUndefined();
  });
});
