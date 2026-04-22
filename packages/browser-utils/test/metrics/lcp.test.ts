import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _sendStandaloneLcpSpan, isValidLcpMetric, MAX_PLAUSIBLE_LCP_DURATION } from '../../src/metrics/lcp';
import * as WebVitalUtils from '../../src/metrics/utils';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    browserPerformanceTimeOrigin: vi.fn(),
    getCurrentScope: vi.fn(),
    htmlTreeAsString: vi.fn(),
  };
});

describe('isValidLcpMetric', () => {
  it('returns true for plausible lcp values', () => {
    expect(isValidLcpMetric(1)).toBe(true);
    expect(isValidLcpMetric(2_500)).toBe(true);
    expect(isValidLcpMetric(MAX_PLAUSIBLE_LCP_DURATION)).toBe(true);
  });

  it('returns false for implausible lcp values', () => {
    expect(isValidLcpMetric(undefined)).toBe(false);
    expect(isValidLcpMetric(0)).toBe(false);
    expect(isValidLcpMetric(-1)).toBe(false);
    expect(isValidLcpMetric(MAX_PLAUSIBLE_LCP_DURATION + 1)).toBe(false);
  });
});

describe('_sendStandaloneLcpSpan', () => {
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
    vi.mocked(SentryCore.browserPerformanceTimeOrigin).mockReturnValue(1000);
    vi.mocked(SentryCore.htmlTreeAsString).mockImplementation((node: any) => `<${node?.tagName || 'div'}>`);
    vi.spyOn(WebVitalUtils, 'startStandaloneWebVitalSpan').mockReturnValue(mockSpan as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a standalone lcp span with entry data', () => {
    const lcpValue = 1_234;
    const mockEntry: LargestContentfulPaint = {
      name: 'largest-contentful-paint',
      entryType: 'largest-contentful-paint',
      startTime: 100,
      duration: 0,
      id: 'image',
      url: 'https://example.com/image.png',
      size: 1234,
      loadTime: 95,
      renderTime: 100,
      element: { tagName: 'img' } as Element,
      toJSON: vi.fn(),
    };

    _sendStandaloneLcpSpan(lcpValue, mockEntry, '123', 'navigation');

    expect(WebVitalUtils.startStandaloneWebVitalSpan).toHaveBeenCalledWith({
      name: '<img>',
      transaction: 'test-transaction',
      attributes: {
        'sentry.origin': 'auto.http.browser.lcp',
        'sentry.op': 'ui.webvital.lcp',
        'sentry.exclusive_time': 0,
        'sentry.pageload.span_id': '123',
        'sentry.report_event': 'navigation',
        'lcp.element': '<img>',
        'lcp.id': 'image',
        'lcp.url': 'https://example.com/image.png',
        'lcp.loadTime': 95,
        'lcp.renderTime': 100,
        'lcp.size': 1234,
      },
      startTime: 1.1,
    });

    expect(mockSpan.addEvent).toHaveBeenCalledWith('lcp', {
      'sentry.measurement_unit': 'millisecond',
      'sentry.measurement_value': lcpValue,
    });
    expect(mockSpan.end).toHaveBeenCalledWith(1.1);
  });

  it('does not send a standalone lcp span for implausibly large values', () => {
    _sendStandaloneLcpSpan(MAX_PLAUSIBLE_LCP_DURATION + 1, undefined, '123', 'pagehide');

    expect(WebVitalUtils.startStandaloneWebVitalSpan).not.toHaveBeenCalled();
    expect(mockSpan.addEvent).not.toHaveBeenCalled();
    expect(mockSpan.end).not.toHaveBeenCalled();
  });
});
