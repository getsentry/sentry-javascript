import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _sendStandaloneClsSpan } from '../../src/metrics/cls';
import * as WebVitalUtils from '../../src/metrics/utils';

// Mock all Sentry core dependencies
vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    browserPerformanceTimeOrigin: vi.fn(),
    timestampInSeconds: vi.fn(),
    getCurrentScope: vi.fn(),
    htmlTreeAsString: vi.fn(),
  };
});

describe('_sendStandaloneClsSpan', () => {
  const mockSpan = {
    addEvent: vi.fn(),
    end: vi.fn(),
  };

  const mockScope = {
    getScopeData: vi.fn().mockReturnValue({
      transactionName: 'test-transaction',
    }),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(SentryCore.getCurrentScope).mockReturnValue(mockScope as any);
    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockReturnValue(1000);
    vi.mocked(SentryCore.timestampInSeconds).mockReturnValue(1.5);
    vi.mocked(SentryCore.htmlTreeAsString).mockImplementation((node: any) => `<${node?.tagName || 'div'}>`);
    vi.spyOn(WebVitalUtils, 'startStandaloneWebVitalSpan').mockReturnValue(mockSpan as any);
  });

  it('sends a standalone CLS span with entry data', () => {
    const clsValue = 0.1;
    const mockEntry: LayoutShift = {
      name: 'layout-shift',
      entryType: 'layout-shift',
      startTime: 100,
      duration: 0,
      value: clsValue,
      hadRecentInput: false,
      sources: [
        // @ts-expect-error - other properties are irrelevant
        {
          node: { tagName: 'div' } as Element,
        },
      ],
      toJSON: vi.fn(),
    };
    const pageloadSpanId = '123';
    const reportEvent = 'navigation';

    _sendStandaloneClsSpan(clsValue, mockEntry, pageloadSpanId, reportEvent);

    expect(WebVitalUtils.startStandaloneWebVitalSpan).toHaveBeenCalledWith({
      name: '<div>',
      transaction: 'test-transaction',
      attributes: {
        'sentry.origin': 'auto.http.browser.cls',
        'sentry.op': 'ui.webvital.cls',
        'sentry.exclusive_time': 0,
        'sentry.pageload.span_id': '123',
        'sentry.report_event': 'navigation',
        'cls.source.1': '<div>',
      },
      startTime: 1.1, // (1000 + 100) / 1000
    });

    expect(mockSpan.addEvent).toHaveBeenCalledWith('cls', {
      'sentry.measurement_unit': '',
      'sentry.measurement_value': 0.1,
    });

    expect(mockSpan.end).toHaveBeenCalledWith(1.1);
  });

  it('sends a standalone CLS span without entry data', () => {
    const clsValue = 0;
    const pageloadSpanId = '456';
    const reportEvent = 'pagehide';

    _sendStandaloneClsSpan(clsValue, undefined, pageloadSpanId, reportEvent);

    expect(SentryCore.timestampInSeconds).toHaveBeenCalled();
    expect(SentryCore.browserPerformanceTimeOrigin).not.toHaveBeenCalled();

    expect(WebVitalUtils.startStandaloneWebVitalSpan).toHaveBeenCalledWith({
      name: 'Layout shift',
      transaction: 'test-transaction',
      attributes: {
        'sentry.origin': 'auto.http.browser.cls',
        'sentry.op': 'ui.webvital.cls',
        'sentry.exclusive_time': 0,
        'sentry.pageload.span_id': pageloadSpanId,
        'sentry.report_event': 'pagehide',
      },
      startTime: 1.5,
    });

    expect(mockSpan.end).toHaveBeenCalledWith(1.5);
    expect(mockSpan.addEvent).toHaveBeenCalledWith('cls', {
      'sentry.measurement_unit': '',
      'sentry.measurement_value': 0,
    });
  });

  it('handles entry with multiple sources', () => {
    const clsValue = 0.15;
    const mockEntry: LayoutShift = {
      name: 'layout-shift',
      entryType: 'layout-shift',
      startTime: 200,
      duration: 0,
      value: clsValue,
      hadRecentInput: false,
      sources: [
        // @ts-expect-error - other properties are irrelevant
        {
          node: { tagName: 'div' } as Element,
        },
        // @ts-expect-error - other properties are irrelevant
        {
          node: { tagName: 'span' } as Element,
        },
      ],
      toJSON: vi.fn(),
    };
    const pageloadSpanId = '789';

    vi.mocked(SentryCore.htmlTreeAsString)
      .mockReturnValueOnce('<div>') // for the name
      .mockReturnValueOnce('<div>') // for source 1
      .mockReturnValueOnce('<span>'); // for source 2

    _sendStandaloneClsSpan(clsValue, mockEntry, pageloadSpanId, 'navigation');

    expect(SentryCore.htmlTreeAsString).toHaveBeenCalledTimes(3);
    expect(WebVitalUtils.startStandaloneWebVitalSpan).toHaveBeenCalledWith({
      name: '<div>',
      transaction: 'test-transaction',
      attributes: {
        'sentry.origin': 'auto.http.browser.cls',
        'sentry.op': 'ui.webvital.cls',
        'sentry.exclusive_time': 0,
        'sentry.pageload.span_id': '789',
        'sentry.report_event': 'navigation',
        'cls.source.1': '<div>',
        'cls.source.2': '<span>',
      },
      startTime: 1.2, // (1000 + 200) / 1000
    });
  });

  it('handles entry without sources', () => {
    const clsValue = 0.05;
    const mockEntry: LayoutShift = {
      name: 'layout-shift',
      entryType: 'layout-shift',
      startTime: 50,
      duration: 0,
      value: clsValue,
      hadRecentInput: false,
      sources: [],
      toJSON: vi.fn(),
    };
    const pageloadSpanId = '101';

    _sendStandaloneClsSpan(clsValue, mockEntry, pageloadSpanId, 'navigation');

    expect(WebVitalUtils.startStandaloneWebVitalSpan).toHaveBeenCalledWith({
      name: '<div>',
      transaction: 'test-transaction',
      attributes: {
        'sentry.origin': 'auto.http.browser.cls',
        'sentry.op': 'ui.webvital.cls',
        'sentry.exclusive_time': 0,
        'sentry.pageload.span_id': '101',
        'sentry.report_event': 'navigation',
      },
      startTime: 1.05, // (1000 + 50) / 1000
    });
  });

  it('handles when startStandaloneWebVitalSpan returns undefined', () => {
    vi.spyOn(WebVitalUtils, 'startStandaloneWebVitalSpan').mockReturnValue(undefined);

    const clsValue = 0.1;
    const pageloadSpanId = '123';

    expect(() => {
      _sendStandaloneClsSpan(clsValue, undefined, pageloadSpanId, 'navigation');
    }).not.toThrow();

    expect(mockSpan.addEvent).not.toHaveBeenCalled();
    expect(mockSpan.end).not.toHaveBeenCalled();
  });

  it('handles when browserPerformanceTimeOrigin returns null', () => {
    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockReturnValue(undefined);

    const clsValue = 0.1;
    const mockEntry: LayoutShift = {
      name: 'layout-shift',
      entryType: 'layout-shift',
      startTime: 200,
      duration: 0,
      value: clsValue,
      hadRecentInput: false,
      sources: [],
      toJSON: vi.fn(),
    };
    const pageloadSpanId = '123';

    _sendStandaloneClsSpan(clsValue, mockEntry, pageloadSpanId, 'navigation');

    expect(WebVitalUtils.startStandaloneWebVitalSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: 0.2,
      }),
    );
  });
});
