import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementTimingIntegration, startTrackingElementTiming } from '../../src/metrics/elementTiming';
import * as browserMetricsInstrumentation from '../../src/metrics/instrument';
import * as browserMetricsUtils from '../../src/metrics/utils';

describe('elementTimingIntegration', () => {
  const distributionSpy = vi.spyOn(sentryCore.metrics, 'distribution');

  let elementHandler: (data: { entries: PerformanceEntry[] }) => void;

  beforeEach(() => {
    distributionSpy.mockClear();

    vi.spyOn(browserMetricsUtils, 'getBrowserPerformanceAPI').mockReturnValue({
      getEntriesByType: vi.fn().mockReturnValue([]),
    } as unknown as Performance);

    vi.spyOn(browserMetricsInstrumentation, 'addPerformanceInstrumentationHandler').mockImplementation(
      (type, handler) => {
        if (type === 'element') {
          elementHandler = handler;
        }
        return () => undefined;
      },
    );
  });

  function setupIntegration(): void {
    const integration = elementTimingIntegration();
    integration.setup({} as sentryCore.Client);
  }

  it('skips entries without an identifier', () => {
    setupIntegration();

    elementHandler({
      entries: [
        {
          name: 'image-paint',
          entryType: 'element',
          startTime: 0,
          duration: 0,
          renderTime: 100,
        } as unknown as PerformanceEntry,
      ],
    });

    expect(distributionSpy).not.toHaveBeenCalled();
  });

  it('emits render_time metric for text-paint entries', () => {
    setupIntegration();

    elementHandler({
      entries: [
        {
          name: 'text-paint',
          entryType: 'element',
          startTime: 0,
          duration: 0,
          renderTime: 150,
          loadTime: 0,
          identifier: 'hero-text',
        } as unknown as PerformanceEntry,
      ],
    });

    expect(distributionSpy).toHaveBeenCalledTimes(1);
    expect(distributionSpy).toHaveBeenCalledWith('element_timing.render_time', 150, {
      unit: 'millisecond',
      attributes: {
        'element.identifier': 'hero-text',
        'element.paint_type': 'text-paint',
      },
    });
  });

  it('emits both render_time and load_time metrics for image-paint entries', () => {
    setupIntegration();

    elementHandler({
      entries: [
        {
          name: 'image-paint',
          entryType: 'element',
          startTime: 0,
          duration: 0,
          renderTime: 200,
          loadTime: 150,
          identifier: 'hero-image',
        } as unknown as PerformanceEntry,
      ],
    });

    expect(distributionSpy).toHaveBeenCalledTimes(2);
    expect(distributionSpy).toHaveBeenCalledWith('element_timing.render_time', 200, {
      unit: 'millisecond',
      attributes: {
        'element.identifier': 'hero-image',
        'element.paint_type': 'image-paint',
      },
    });
    expect(distributionSpy).toHaveBeenCalledWith('element_timing.load_time', 150, {
      unit: 'millisecond',
      attributes: {
        'element.identifier': 'hero-image',
        'element.paint_type': 'image-paint',
      },
    });
  });

  it('handles multiple entries in a single batch', () => {
    setupIntegration();

    elementHandler({
      entries: [
        {
          name: 'text-paint',
          entryType: 'element',
          startTime: 0,
          duration: 0,
          renderTime: 100,
          loadTime: 0,
          identifier: 'heading',
        } as unknown as PerformanceEntry,
        {
          name: 'image-paint',
          entryType: 'element',
          startTime: 0,
          duration: 0,
          renderTime: 300,
          loadTime: 250,
          identifier: 'banner',
        } as unknown as PerformanceEntry,
      ],
    });

    // heading: 1 render_time, banner: 1 render_time + 1 load_time
    expect(distributionSpy).toHaveBeenCalledTimes(3);
  });
});

describe('startTrackingElementTiming', () => {
  it('is a deprecated no-op that returns a cleanup function', () => {
    const cleanup = startTrackingElementTiming();
    expect(typeof cleanup).toBe('function');
  });
});
