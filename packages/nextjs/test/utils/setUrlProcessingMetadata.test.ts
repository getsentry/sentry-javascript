import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { setUrlProcessingMetadata } from '../../src/common/utils/setUrlProcessingMetadata';

describe('setUrlProcessingMetadata', () => {
  it('skips non-transaction events', () => {
    const event: Event = { type: undefined };
    setUrlProcessingMetadata(event);
  });

  it('adds URL without sendDefaultPii', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ sendDefaultPii: false }),
    } as unknown as SentryCore.Client);

    const scopeData = {
      sdkProcessingMetadata: {
        normalizedRequest: {
          headers: {
            'x-forwarded-proto': 'https',
            host: 'example.com',
          },
        },
      },
    };

    const event: Event = {
      type: 'transaction',
      contexts: {
        trace: {
          op: 'http.server',
          data: {
            'next.route': '/api/users/[id]',
            'http.target': '/api/users/123',
          },
        },
      },
      sdkProcessingMetadata: {
        capturedSpanIsolationScope: { getScopeData: () => scopeData },
      },
    };

    setUrlProcessingMetadata(event);
    expect(scopeData.sdkProcessingMetadata.normalizedRequest.url).toBe('https://example.com/api/users/123');
  });

  it('skips when no client is available', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

    const event: Event = {
      type: 'transaction',
      contexts: { trace: { op: 'http.server', data: { 'next.route': '/test' } } },
    };

    setUrlProcessingMetadata(event);
  });
});
