import { getTraceMetaTags } from '@sentry/core';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { addSentryTracingMetaTags } from '../../../src/runtime/utils';

vi.mock(import('@sentry/core'), async importOriginal => {
  const mod = await importOriginal();
  return {
    ...mod,
    getTraceMetaTags: vi.fn(),
  };
});

describe('addSentryTracingMetaTags', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should add meta tags to the head array', () => {
    const mockMetaTags = [
      '<meta name="sentry-trace" content="12345678901234567890123456789012-1234567890123456-1"/>',
      '<meta name="baggage" content="sentry-environment=production"/>',
    ].join('\n');

    // return value is mocked here as return values of `getTraceMetaTags` are tested separately (in @sentry/core)
    (getTraceMetaTags as Mock).mockReturnValue(mockMetaTags);

    const head: string[] = [];
    addSentryTracingMetaTags(head);

    expect(head).toContain(mockMetaTags);
  });

  it('should handle empty meta tags', () => {
    (getTraceMetaTags as Mock).mockReturnValue('');

    const head: string[] = [];
    addSentryTracingMetaTags(head);

    expect(head).toHaveLength(0);
  });
});
