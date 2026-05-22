import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { setUrlProcessingMetadata } from '../../src/common/utils/setUrlProcessingMetadata';

function makeTransactionEvent(overrides?: Partial<Event>): Event {
  return {
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
      capturedSpanIsolationScope: {
        getScopeData: () => ({
          sdkProcessingMetadata: {
            normalizedRequest: {
              headers: {
                'x-forwarded-proto': 'https',
                host: 'example.com',
              },
            },
          },
        }),
      },
    },
    ...overrides,
  };
}

describe('setUrlProcessingMetadata', () => {
  it('skips non-transaction events', () => {
    const event = makeTransactionEvent({ type: undefined });
    setUrlProcessingMetadata(event);
    // No error thrown, nothing changed
  });

  it('skips when sendDefaultPii is false', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ sendDefaultPii: false }),
    } as unknown as SentryCore.Client);

    const scopeData = {
      sdkProcessingMetadata: {
        normalizedRequest: {
          headers: { host: 'example.com' },
        },
      },
    };

    const event = makeTransactionEvent({
      sdkProcessingMetadata: {
        capturedSpanIsolationScope: { getScopeData: () => scopeData },
      },
    });

    setUrlProcessingMetadata(event);
    expect(scopeData.sdkProcessingMetadata.normalizedRequest).not.toHaveProperty('url');
  });

  it('adds URL when sendDefaultPii is true', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getOptions: () => ({ sendDefaultPii: true }),
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
});
