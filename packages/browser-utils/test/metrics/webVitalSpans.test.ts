import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _emitWebVitalSpan, _sendClsSpan, _sendInpSpan, _sendLcpSpan } from '../../src/metrics/webVitalSpans';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    browserPerformanceTimeOrigin: vi.fn(),
    timestampInSeconds: vi.fn(),
    getCurrentScope: vi.fn(),
    htmlTreeAsString: vi.fn(),
    startInactiveSpan: vi.fn(),
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
    spanToJSON: vi.fn(),
  };
});

// Mock WINDOW
vi.mock('../../src/types', () => ({
  WINDOW: {
    navigator: { userAgent: 'test-user-agent' },
    performance: {
      getEntriesByType: vi.fn().mockReturnValue([]),
    },
  },
}));

describe('_emitWebVitalSpan', () => {
  const mockSpan = {
    addEvent: vi.fn(),
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a non-standalone span with correct attributes', () => {
    _emitWebVitalSpan({
      name: 'Test Vital',
      op: 'ui.webvital.test',
      origin: 'auto.http.browser.test',
      metricName: 'test',
      value: 100,
      unit: 'millisecond',
      startTime: 1.5,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith({
      name: 'Test Vital',
      attributes: {
        'sentry.origin': 'auto.http.browser.test',
        'sentry.op': 'ui.webvital.test',
        'sentry.exclusive_time': 0,
        'browser.web_vital.test.value': 100,
        transaction: 'test-transaction',
        'user_agent.original': 'test-user-agent',
      },
      startTime: 1.5,
    });

    // No standalone flag
    expect(SentryCore.startInactiveSpan).not.toHaveBeenCalledWith(
      expect.objectContaining({ experimental: expect.anything() }),
    );

    expect(mockSpan.addEvent).toHaveBeenCalledWith('test', {
      'sentry.measurement_unit': 'millisecond',
      'sentry.measurement_value': 100,
    });

    expect(mockSpan.end).toHaveBeenCalledWith(1.5);
  });

  it('includes pageloadSpanId when provided', () => {
    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.webvital.test',
      origin: 'auto.http.browser.test',
      metricName: 'test',
      value: 50,
      unit: 'millisecond',
      pageloadSpanId: 'abc123',
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.pageload.span_id': 'abc123',
        }),
      }),
    );
  });

  it('merges additional attributes', () => {
    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.webvital.test',
      origin: 'auto.http.browser.test',
      metricName: 'test',
      value: 50,
      unit: 'millisecond',
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
        op: 'ui.webvital.test',
        origin: 'auto.http.browser.test',
        metricName: 'test',
        value: 50,
        unit: 'millisecond',
        startTime: 1.0,
      });
    }).not.toThrow();
  });
});

describe('_sendLcpSpan', () => {
  const mockSpan = {
    addEvent: vi.fn(),
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
    vi.mocked(SentryCore.htmlTreeAsString).mockImplementation((node: any) => `<${node?.tagName || 'div'}>`);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a streamed LCP span with entry data', () => {
    const mockEntry = {
      element: { tagName: 'img' } as Element,
      id: 'hero',
      url: 'https://example.com/hero.jpg',
      loadTime: 100,
      renderTime: 150,
      size: 50000,
      startTime: 200,
    } as LargestContentfulPaint;

    _sendLcpSpan(250, mockEntry, 'pageload-123');

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '<img>',
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.browser.lcp',
          'sentry.op': 'ui.webvital.lcp',
          'sentry.exclusive_time': 0,
          'sentry.pageload.span_id': 'pageload-123',
          'browser.web_vital.lcp.element': '<img>',
          'browser.web_vital.lcp.id': 'hero',
          'browser.web_vital.lcp.url': 'https://example.com/hero.jpg',
          'browser.web_vital.lcp.load_time': 100,
          'browser.web_vital.lcp.render_time': 150,
          'browser.web_vital.lcp.size': 50000,
        }),
        startTime: 1, // timeOrigin: 1000 / 1000
      }),
    );

    expect(mockSpan.addEvent).toHaveBeenCalledWith('lcp', {
      'sentry.measurement_unit': 'millisecond',
      'sentry.measurement_value': 250,
    });

    // endTime = timeOrigin + entry.startTime = (1000 + 200) / 1000 = 1.2
    expect(mockSpan.end).toHaveBeenCalledWith(1.2);
  });

  it('sends a streamed LCP span without entry data', () => {
    _sendLcpSpan(0, undefined, 'pageload-456');

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Largest contentful paint',
        startTime: 1, // timeOrigin: 1000 / 1000
      }),
    );
  });
});

describe('_sendClsSpan', () => {
  const mockSpan = {
    addEvent: vi.fn(),
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
    vi.mocked(SentryCore.timestampInSeconds).mockReturnValue(1.5);
    vi.mocked(SentryCore.htmlTreeAsString).mockImplementation((node: any) => `<${node?.tagName || 'div'}>`);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a streamedCLS span with entry data and sources', () => {
    const mockEntry: LayoutShift = {
      name: 'layout-shift',
      entryType: 'layout-shift',
      startTime: 100,
      duration: 0,
      value: 0.1,
      hadRecentInput: false,
      sources: [
        // @ts-expect-error - other properties are irrelevant
        { node: { tagName: 'div' } as Element },
        // @ts-expect-error - other properties are irrelevant
        { node: { tagName: 'span' } as Element },
      ],
      toJSON: vi.fn(),
    };

    vi.mocked(SentryCore.htmlTreeAsString)
      .mockReturnValueOnce('<div>') // for the name
      .mockReturnValueOnce('<div>') // for source 1
      .mockReturnValueOnce('<span>'); // for source 2

    _sendClsSpan(0.1, mockEntry, 'pageload-789');

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '<div>',
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.browser.cls',
          'sentry.op': 'ui.webvital.cls',
          'sentry.pageload.span_id': 'pageload-789',
          'browser.web_vital.cls.source.1': '<div>',
          'browser.web_vital.cls.source.2': '<span>',
        }),
      }),
    );

    expect(mockSpan.addEvent).toHaveBeenCalledWith('cls', {
      'sentry.measurement_unit': '',
      'sentry.measurement_value': 0.1,
    });
  });

  it('sends a streamedCLS span without entry data', () => {
    _sendClsSpan(0, undefined, 'pageload-000');

    expect(SentryCore.timestampInSeconds).toHaveBeenCalled();
    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Layout shift',
        startTime: 1.5,
      }),
    );
  });
});

describe('_sendInpSpan', () => {
  const mockSpan = {
    addEvent: vi.fn(),
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
    vi.mocked(SentryCore.htmlTreeAsString).mockReturnValue('<button>');
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
    vi.mocked(SentryCore.getActiveSpan).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a streamed INP span with duration matching interaction', () => {
    const mockEntry = {
      name: 'pointerdown',
      startTime: 500,
      duration: 120,
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
        }),
      }),
    );

    expect(mockSpan.addEvent).toHaveBeenCalledWith('inp', {
      'sentry.measurement_unit': 'millisecond',
      'sentry.measurement_value': 120,
    });

    // endTime = startTime + duration = 1.5 + 120/1000 = 1.62
    expect(mockSpan.end).toHaveBeenCalledWith(1.62);
  });

  it('sends a streamed INP span for a keypress interaction', () => {
    const mockEntry = {
      name: 'keydown',
      startTime: 600,
      duration: 80,
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
});
