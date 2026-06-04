import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { htmlTreeAsString } from '../../src/htmlTreeAsString';
import * as inpModule from '../../src/metrics/inp';
import { _emitWebVitalSpan, _sendInpSpan } from '../../src/metrics/webVitalSpans';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    browserPerformanceTimeOrigin: vi.fn(),
    timestampInSeconds: vi.fn(),
    getCurrentScope: vi.fn(),
    startInactiveSpan: vi.fn(),
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    spanToJSON: vi.fn(),
    spanToStreamedSpanJSON: vi.fn(),
  };
});

vi.mock('../../src/htmlTreeAsString', () => ({
  htmlTreeAsString: vi.fn(),
}));

// Mock WINDOW
vi.mock('../../src/types', () => ({
  WINDOW: {
    navigator: { userAgent: 'test-user-agent' },
    performance: {
      getEntriesByType: vi.fn().mockReturnValue([]),
    },
  },
}));

function createMockPageloadSpan(spanId: string) {
  return {
    spanContext: () => ({ spanId, traceId: 'trace-1', traceFlags: 1 }),
    end: vi.fn(),
  };
}

describe('_emitWebVitalSpan', () => {
  const mockSpan = {
    end: vi.fn(),
  };

  const mockScope = {
    getScopeData: vi.fn().mockReturnValue({
      transactionName: 'test-transaction',
    }),
  };

  beforeEach(() => {
    vi.mocked(SentryCore.getCurrentScope).mockReturnValue(mockScope as any);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({ attributes: {} } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a non-standalone span with correct attributes', () => {
    _emitWebVitalSpan({
      name: 'Test Vital',
      op: 'ui.webvital.lcp',
      origin: 'auto.http.browser.lcp',
      metricName: 'lcp',
      value: 100,
      startTime: 1.5,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith({
      name: 'Test Vital',
      attributes: {
        'sentry.origin': 'auto.http.browser.lcp',
        'sentry.op': 'ui.webvital.lcp',
        'sentry.exclusive_time': 0,
        'browser.web_vital.lcp.value': 100,
        'sentry.transaction': 'test-transaction',
        'user_agent.original': 'test-user-agent',
      },
      startTime: 1.5,
    });

    // No standalone flag
    expect(SentryCore.startInactiveSpan).not.toHaveBeenCalledWith(
      expect.objectContaining({ experimental: expect.anything() }),
    );

    expect(mockSpan.end).toHaveBeenCalledWith(1.5);
  });

  it('includes pageload span id when parentSpan is a pageload span', () => {
    const mockPageloadSpan = createMockPageloadSpan('abc123');
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({
      attributes: { 'sentry.op': 'pageload' },
    } as any);

    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.webvital.lcp',
      origin: 'auto.http.browser.lcp',
      metricName: 'lcp',
      value: 50,
      parentSpan: mockPageloadSpan as any,
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.pageload.span_id': 'abc123',
        }),
        parentSpan: mockPageloadSpan,
      }),
    );
  });

  it('does not include pageload span id when parentSpan is not a pageload span', () => {
    const mockNonPageloadSpan = createMockPageloadSpan('xyz789');
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({
      attributes: { 'sentry.op': 'ui.interaction.click' },
    } as any);

    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      metricName: 'inp',
      value: 50,
      parentSpan: mockNonPageloadSpan as any,
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.not.objectContaining({
          'sentry.pageload.span_id': expect.anything(),
        }),
      }),
    );
  });

  it('includes reportEvent when provided', () => {
    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.webvital.cls',
      origin: 'auto.http.browser.cls',
      metricName: 'cls',
      value: 0.1,
      reportEvent: 'pagehide',
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'browser.web_vital.cls.report_event': 'pagehide',
        }),
      }),
    );
  });

  it('merges additional attributes', () => {
    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.webvital.lcp',
      origin: 'auto.http.browser.lcp',
      metricName: 'lcp',
      value: 50,
      attributes: { 'custom.attr': 'value' },
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'custom.attr': 'value',
        }),
      }),
    );
  });

  it('handles when startInactiveSpan returns undefined', () => {
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(undefined as any);

    expect(() => {
      _emitWebVitalSpan({
        name: 'Test',
        op: 'ui.webvital.lcp',
        origin: 'auto.http.browser.lcp',
        metricName: 'lcp',
        value: 50,
        startTime: 1.0,
      });
    }).not.toThrow();
  });
});

describe('_sendInpSpan', () => {
  const mockSpan = {
    end: vi.fn(),
  };

  const mockScope = {
    getScopeData: vi.fn().mockReturnValue({
      transactionName: 'test-route',
    }),
  };

  beforeEach(() => {
    vi.mocked(SentryCore.getCurrentScope).mockReturnValue(mockScope as any);
    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockReturnValue(1000);
    vi.mocked(htmlTreeAsString).mockReturnValue('<button>');
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
    vi.mocked(SentryCore.getActiveSpan).mockReturnValue(undefined);
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({ attributes: {} } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a streamed INP span with duration matching interaction', () => {
    vi.spyOn(inpModule, 'getCachedInteractionContext').mockReturnValue(undefined);

    const mockEntry = {
      name: 'pointerdown',
      startTime: 500,
      duration: 120,
      interactionId: 1,
      target: { tagName: 'button' },
    };

    _sendInpSpan(120, mockEntry);

    // startTime = (1000 + 500) / 1000 = 1.5
    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '<button>',
        startTime: 1.5,
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.browser.inp',
          'sentry.op': 'ui.interaction.click',
          'sentry.exclusive_time': 120,
          'sentry.transaction': 'test-route',
        }),
      }),
    );

    // endTime = startTime + duration = 1.5 + 120/1000 = 1.62
    expect(mockSpan.end).toHaveBeenCalledWith(1.62);
  });

  it('sends a streamed INP span for a keypress interaction', () => {
    vi.spyOn(inpModule, 'getCachedInteractionContext').mockReturnValue(undefined);

    const mockEntry = {
      name: 'keydown',
      startTime: 600,
      duration: 80,
      interactionId: 2,
      target: { tagName: 'input' },
    };

    _sendInpSpan(80, mockEntry);

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.op': 'ui.interaction.press',
        }),
      }),
    );
  });

  it('uses cached element name and span from registerInpInteractionListener', () => {
    const mockRootSpan = createMockPageloadSpan('span-42');
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({
      name: 'cached-route',
      attributes: { 'sentry.op': 'navigation' },
    } as any);
    vi.spyOn(inpModule, 'getCachedInteractionContext').mockReturnValue({
      elementName: 'body > CachedButton',
      span: mockRootSpan as any,
    });

    const mockEntry = {
      name: 'pointerdown',
      startTime: 500,
      duration: 100,
      interactionId: 42,
      target: { tagName: 'button' },
    };

    _sendInpSpan(100, mockEntry);

    expect(inpModule.getCachedInteractionContext).toHaveBeenCalledWith(42);

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'body > CachedButton',
        attributes: expect.objectContaining({
          'sentry.transaction': 'cached-route',
        }),
        parentSpan: mockRootSpan,
      }),
    );
  });
});
