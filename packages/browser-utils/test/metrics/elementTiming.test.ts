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
    integration?.setup?.({} as sentryCore.Client);
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
          id: 'hero',
          element: { tagName: 'P' },
          naturalWidth: 0,
          naturalHeight: 0,
        } as unknown as PerformanceEntry,
      ],
    });

    expect(distributionSpy).toHaveBeenCalledTimes(1);
    expect(distributionSpy).toHaveBeenCalledWith('element_timing.render_time', 150, {
      unit: 'millisecond',
      attributes: {
        'sentry.origin': 'auto.ui.browser.element_timing',
        'ui.element.identifier': 'hero-text',
        'ui.element.paint_type': 'text-paint',
        'ui.element.id': 'hero',
        'ui.element.type': 'p',
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
          id: 'img1',
          element: { tagName: 'IMG' },
          url: 'https://example.com/hero.jpg',
          naturalWidth: 1920,
          naturalHeight: 1080,
        } as unknown as PerformanceEntry,
      ],
    });

    expect(distributionSpy).toHaveBeenCalledTimes(2);
    const expectedAttributes = {
      'sentry.origin': 'auto.ui.browser.element_timing',
      'ui.element.identifier': 'hero-image',
      'ui.element.paint_type': 'image-paint',
      'ui.element.id': 'img1',
      'ui.element.type': 'img',
      'ui.element.url': 'https://example.com/hero.jpg',
      'ui.element.width': 1920,
      'ui.element.height': 1080,
    };
    expect(distributionSpy).toHaveBeenCalledWith('element_timing.render_time', 200, {
      unit: 'millisecond',
      attributes: expectedAttributes,
    });
    expect(distributionSpy).toHaveBeenCalledWith('element_timing.load_time', 150, {
      unit: 'millisecond',
      attributes: expectedAttributes,
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
