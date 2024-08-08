import { afterEach, describe, expect, it, vi } from 'vitest';
import { addSentryTracingMetaTags } from '../../../src/runtime/utils';

const mockReturns = vi.hoisted(() => {
  return {
    traceHeader: 'trace-header',
    baggageHeader: 'baggage-header',
  };
});

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');

  return {
    ...actual,
    getActiveSpan: vi.fn().mockReturnValue({ spanId: '123' }),
    getRootSpan: vi.fn().mockReturnValue({ spanId: 'root123' }),
    spanToTraceHeader: vi.fn(() => mockReturns.traceHeader),
  };
});

vi.mock('@sentry/opentelemetry', async () => {
  const actual = await vi.importActual('@sentry/opentelemetry');

  return {
    ...actual,
    getDynamicSamplingContextFromSpan: vi.fn().mockReturnValue('contextValue'),
  };
});

vi.mock('@sentry/utils', async () => {
  const actual = await vi.importActual('@sentry/utils');

  return {
    ...actual,
    dynamicSamplingContextToSentryBaggageHeader: vi.fn().mockReturnValue(mockReturns.baggageHeader),
  };
});

describe('addSentryTracingMetaTags', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should add meta tags', () => {
    const head: string[] = [];
    addSentryTracingMetaTags(head);

    expect(head).toContain(`<meta name="sentry-trace" content="${mockReturns.traceHeader}"/>`);
    expect(head).toContain(`<meta name="baggage" content="${mockReturns.baggageHeader}"/>`);
  });

  it('should also add meta tags when there is no active root span', () => {
    vi.doMock('@sentry/core', async () => {
      const actual = await vi.importActual('@sentry/core');

      return {
        ...actual,
        getActiveSpan: vi.fn().mockReturnValue(undefined),
      };
    });

    const head: string[] = [];
    addSentryTracingMetaTags(head);

    expect(head).toHaveLength(1);
  });
});
