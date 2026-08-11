import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { htmlTreeAsString } from '../../src/htmlTreeAsString';
import * as inpModule from '../../src/web-vitals/inp';
import * as instrument from '../../src/instrumentation/performanceObserver';
import { MAX_PLAUSIBLE_LCP_DURATION } from '../../src/web-vitals/lcp';
import {
  _emitWebVitalSpan,
  _sendClsSpan,
  _sendInpSpan,
  _sendLcpSpan,
  trackInpAsSpan,
} from '../../src/web-vitals/spans';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    browserPerformanceTimeOrigin: vi.fn(),
    timestampInSeconds: vi.fn(),
    getCurrentScope: vi.fn(),
    getClient: vi.fn(),
    startInactiveSpan: vi.fn(),
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
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
    addEventListener: vi.fn(),
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
    vi.mocked(SentryCore.getClient).mockReturnValue({ getIntegrationByName: () => undefined } as any);
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
        'sentry.segment.name': 'test-transaction',
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

  it('marks the span as standalone when standalone is set', () => {
    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      metricName: 'inp',
      value: 100,
      startTime: 1.5,
      standalone: true,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({ experimental: { standalone: true } }),
    );
  });

  it('adds the replay id to a standalone span when a replay is recording', () => {
    vi.mocked(SentryCore.getClient).mockReturnValue({
      getIntegrationByName: () => ({ getReplayId: () => 'replay-123', getRecordingMode: () => 'session' }),
    } as any);

    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      metricName: 'inp',
      value: 100,
      startTime: 1.5,
      standalone: true,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.replay_id': 'replay-123',
          'sentry._internal.replay_is_buffering': undefined,
        }),
      }),
    );
  });

  it('flags buffering when the replay is in buffer mode', () => {
    vi.mocked(SentryCore.getClient).mockReturnValue({
      getIntegrationByName: () => ({ getReplayId: () => 'replay-123', getRecordingMode: () => 'buffer' }),
    } as any);

    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      metricName: 'inp',
      value: 100,
      startTime: 1.5,
      standalone: true,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ 'sentry._internal.replay_is_buffering': true }),
      }),
    );
  });

  it('does not add a replay id to non-standalone spans', () => {
    vi.mocked(SentryCore.getClient).mockReturnValue({
      getIntegrationByName: () => ({ getReplayId: () => 'replay-123', getRecordingMode: () => 'session' }),
    } as any);

    _emitWebVitalSpan({
      name: 'Test',
      op: 'ui.interaction.click',
      origin: 'auto.http.browser.inp',
      metricName: 'inp',
      value: 100,
      startTime: 1.5,
    });

    const attributes = vi.mocked(SentryCore.startInactiveSpan).mock.calls[0]![0].attributes!;
    expect(attributes['sentry.replay_id']).toBeUndefined();
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

describe('_sendLcpSpan', () => {
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
    vi.mocked(htmlTreeAsString).mockImplementation((node: any) => `<${node?.tagName || 'div'}>`);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({
      attributes: { 'sentry.op': 'pageload' },
    } as any);
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

    const mockPageloadSpan = createMockPageloadSpan('pageload-123');

    _sendLcpSpan(250, mockEntry, mockPageloadSpan as any, 'pagehide');

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
          'browser.web_vital.lcp.report_event': 'pagehide',
          'sentry.transaction': 'test-route',
          'sentry.segment.name': 'test-route',
        }),
        startTime: 1, // timeOrigin: 1000 / 1000
        parentSpan: mockPageloadSpan,
      }),
    );

    // endTime = timeOrigin + entry.startTime = (1000 + 200) / 1000 = 1.2
    expect(mockSpan.end).toHaveBeenCalledWith(1.2);
  });

  it('sends a streamed LCP span without entry data', () => {
    _sendLcpSpan(250, undefined);

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Largest contentful paint',
        startTime: 1, // timeOrigin: 1000 / 1000
      }),
    );
  });

  it('drops implausible LCP values', () => {
    _sendLcpSpan(0, undefined);
    _sendLcpSpan(MAX_PLAUSIBLE_LCP_DURATION + 1, undefined);

    expect(SentryCore.startInactiveSpan).not.toHaveBeenCalled();
  });
});

describe('_sendClsSpan', () => {
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
    vi.mocked(SentryCore.timestampInSeconds).mockReturnValue(1.5);
    vi.mocked(htmlTreeAsString).mockImplementation((node: any) => `<${node?.tagName || 'div'}>`);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue(mockSpan as any);
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({
      attributes: { 'sentry.op': 'pageload' },
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a streamed CLS span with entry data and sources', () => {
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

    vi.mocked(htmlTreeAsString)
      .mockReturnValueOnce('<div>') // for the name
      .mockReturnValueOnce('<div>') // for source 1
      .mockReturnValueOnce('<span>'); // for source 2

    const mockPageloadSpan = createMockPageloadSpan('pageload-789');

    _sendClsSpan(0.1, mockEntry, mockPageloadSpan as any, 'navigation');

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '<div>',
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.browser.cls',
          'sentry.op': 'ui.webvital.cls',
          'sentry.pageload.span_id': 'pageload-789',
          'browser.web_vital.cls.source.1': '<div>',
          'browser.web_vital.cls.source.2': '<span>',
          'browser.web_vital.cls.report_event': 'navigation',
          'sentry.transaction': 'test-route',
          'sentry.segment.name': 'test-route',
        }),
        parentSpan: mockPageloadSpan,
      }),
    );
  });

  it('sends a streamed CLS span without entry data', () => {
    _sendClsSpan(0, undefined);

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
          'sentry.segment.name': 'test-route',
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
          'sentry.segment.name': 'cached-route',
        }),
        parentSpan: mockRootSpan,
      }),
    );
  });
});

describe('trackInpAsSpan', () => {
  // A streaming client keeps these emission-focused tests out of the standalone-buffer branch.
  const streamingClient = { getOptions: () => ({ traceLifecycle: 'stream' }), on: vi.fn() } as any;

  const mockScope = {
    getScopeData: vi.fn().mockReturnValue({ transactionName: 'test-route' }),
  };

  const validMetric = {
    value: 120,
    entries: [{ name: 'pointerdown', startTime: 500, duration: 120, interactionId: 1, target: { tagName: 'button' } }],
  };

  let inpCallback: (arg: { metric: any }) => void;

  beforeEach(() => {
    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockReturnValue(1000);
    vi.mocked(SentryCore.getCurrentScope).mockReturnValue(mockScope as any);
    vi.mocked(SentryCore.getActiveSpan).mockReturnValue(undefined);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue({ end: vi.fn() } as any);
    vi.mocked(SentryCore.spanToStreamedSpanJSON).mockReturnValue({ attributes: {} } as any);
    vi.mocked(htmlTreeAsString).mockReturnValue('<button>');
    vi.spyOn(inpModule, 'getCachedInteractionContext').mockReturnValue(undefined);
    vi.spyOn(instrument, 'addInpInstrumentationHandler').mockImplementation((cb: any) => {
      inpCallback = cb;
      return () => undefined;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits INP as a streamed span when span streaming is enabled', () => {
    trackInpAsSpan(streamingClient);
    inpCallback({ metric: validMetric });

    const call = vi.mocked(SentryCore.startInactiveSpan).mock.calls[0]![0];
    expect(call.experimental).toBeUndefined();
    expect(call.attributes?.['sentry.op']).toBe('ui.interaction.click');
  });

  it('emits INP as a standalone span when span streaming is disabled', () => {
    const staticClient = { getOptions: () => ({ traceLifecycle: 'static' }), on: vi.fn() } as any;
    trackInpAsSpan(staticClient);
    inpCallback({ metric: validMetric });

    const call = vi.mocked(SentryCore.startInactiveSpan).mock.calls[0]![0];
    expect(call.experimental).toEqual({ standalone: true });
  });

  it('ignores INP metrics without a value', () => {
    trackInpAsSpan(streamingClient);
    inpCallback({ metric: { value: null, entries: [] } });
    expect(SentryCore.startInactiveSpan).not.toHaveBeenCalled();
  });

  it('ignores implausibly long INP durations', () => {
    trackInpAsSpan(streamingClient);
    inpCallback({ metric: { value: (inpModule.MAX_PLAUSIBLE_INP_DURATION + 1) * 1000, entries: validMetric.entries } });
    expect(SentryCore.startInactiveSpan).not.toHaveBeenCalled();
  });

  it('ignores INP metrics without a matching interaction entry', () => {
    trackInpAsSpan(streamingClient);
    inpCallback({ metric: { value: 120, entries: [{ name: 'scroll', duration: 120 }] } });
    expect(SentryCore.startInactiveSpan).not.toHaveBeenCalled();
  });
});
