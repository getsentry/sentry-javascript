import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceElementTiming } from '../../src/metrics/elementTiming';
import { _onElementTiming, startTrackingElementTiming } from '../../src/metrics/elementTiming';
import * as browserMetricsInstrumentation from '../../src/metrics/instrument';
import * as browserMetricsUtils from '../../src/metrics/utils';

describe('_onElementTiming', () => {
  const spanEndSpy = vi.fn();
  const startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockImplementation((opts, cb) => {
    // @ts-expect-error - only passing a partial span. This is fine for the test.
    cb({
      end: spanEndSpy,
    });
  });

  const timeOrigin = Date.now();
  vi.spyOn(SentryCore, 'browserPerformanceTimeOrigin').mockReturnValue(timeOrigin);

  beforeEach(() => {
    startSpanSpy.mockClear();
    spanEndSpy.mockClear();
  });

  it('does nothing if the ET entry has no identifier', () => {
    const entry = {
      name: 'image-paint',
      entryType: 'element',
      startTime: 0,
      duration: 0,
      renderTime: 100,
    } as Partial<PerformanceEntry>;

    // @ts-expect-error - only passing a partial entry. This is fine for the test.
    _onElementTiming({ entries: [entry] });

    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it("does nothing if there's no time origin", () => {
    vi.spyOn(SentryCore, 'browserPerformanceTimeOrigin').mockReturnValueOnce(undefined);

    const entry = {
      name: 'image-paint',
      entryType: 'element',
      startTime: 0,
      duration: 0,
    } as Partial<PerformanceEntry>;

    // @ts-expect-error - only passing a partial entry. This is fine for the test.
    _onElementTiming({ entries: [entry] });

    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it.each([0, undefined])('does nothing if startTime is %s (i.e. no loadTime, no renderTime)', startTime => {
    const entry = {
      name: 'image-paint',
      entryType: 'element',
      startTime,
      duration: 0,
    } as Partial<PerformanceEntry>;

    // @ts-expect-error - only passing a partial entry. This is fine for the test.
    _onElementTiming({ entries: [entry] });

    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  describe('span start time', () => {
    it('uses loadTime as span start time if available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 100,
        duration: 0,
        renderTime: 100,
        loadTime: 50,
        identifier: 'test-element',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: (timeOrigin + entry.loadTime!) / 1000,
          attributes: expect.objectContaining({
            'sentry.op': 'ui.elementtiming',
            'sentry.origin': 'auto.ui.browser.elementtiming',
            'sentry.source': 'component',
            'ui.element.render_time': 100,
            'ui.element.load_time': 50,
            'ui.element.identifier': 'test-element',
            'ui.element.paint_type': 'image-paint',
          }),
        }),
        expect.any(Function),
      );
    });

    it('uses renderTime as span start time if loadTime is not available', () => {
      const entry = {
        name: 'text-paint',
        entryType: 'element',
        startTime: 100,
        duration: 0,
        renderTime: 100,
        identifier: 'test-element',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: (timeOrigin + entry.renderTime!) / 1000,
          attributes: expect.objectContaining({
            'sentry.op': 'ui.elementtiming',
            'sentry.origin': 'auto.ui.browser.elementtiming',
            'sentry.source': 'component',
            'ui.element.render_time': 100,
            'ui.element.load_time': undefined,
            'ui.element.identifier': 'test-element',
            'ui.element.paint_type': 'text-paint',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('span duration', () => {
    it('uses (render-load) time as duration for image paints', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 1500,
        duration: 0,
        renderTime: 1505,
        loadTime: 1500,
        identifier: 'test-element',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: (timeOrigin + entry.loadTime!) / 1000,
          attributes: expect.objectContaining({
            'ui.element.render_time': 1505,
            'ui.element.load_time': 1500,
            'ui.element.paint_type': 'image-paint',
          }),
        }),
        expect.any(Function),
      );

      expect(spanEndSpy).toHaveBeenCalledWith((timeOrigin + entry.renderTime!) / 1000);
    });

    it('uses 0 as duration for text paints', () => {
      const entry = {
        name: 'text-paint',
        entryType: 'element',
        startTime: 1600,
        duration: 0,
        loadTime: 0,
        renderTime: 1600,
        identifier: 'test-element',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: (timeOrigin + entry.renderTime!) / 1000,
          attributes: expect.objectContaining({
            'ui.element.paint_type': 'text-paint',
            'ui.element.render_time': 1600,
            'ui.element.load_time': 0,
          }),
        }),
        expect.any(Function),
      );

      expect(spanEndSpy).toHaveBeenCalledWith((timeOrigin + entry.renderTime!) / 1000);
    });

    it('uses 0 duration for 3rd party image nodes w/o Timing-Allow-Origin header', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 1700,
        duration: 0,
        loadTime: 1700,
        renderTime: 0,
        identifier: 'test-element',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: (timeOrigin + entry.loadTime!) / 1000,
          attributes: expect.objectContaining({
            'ui.element.paint_type': 'image-paint',
            'ui.element.render_time': 0,
            'ui.element.load_time': 1700,
          }),
        }),
        expect.any(Function),
      );

      expect(spanEndSpy).toHaveBeenCalledWith((timeOrigin + entry.loadTime!) / 1000);
    });
  });

  describe('span attributes', () => {
    it('sets element type, identifier, paint type, load and render time', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 100,
        duration: 0,
        renderTime: 100,
        identifier: 'my-image',
        element: {
          tagName: 'IMG',
        },
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'ui.element.type': 'img',
            'ui.element.identifier': 'my-image',
            'ui.element.paint_type': 'image-paint',
            'ui.element.render_time': 100,
          }),
        }),
        expect.any(Function),
      );
    });

    it('sets element dimensions if available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        loadToe: 50,
        startTime: 100,
        duration: 0,
        renderTime: 100,
        naturalWidth: 512,
        naturalHeight: 256,
        identifier: 'my-image',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'ui.element.width': 512,
            'ui.element.height': 256,
            'ui.element.identifier': 'my-image',
          }),
        }),
        expect.any(Function),
      );
    });

    it('sets element url if available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 100,
        renderTime: 100,
        loadTime: 50,
        duration: 0,
        url: 'https://santry.com/image.png',
        identifier: 'my-image',
      } as Partial<PerformanceElementTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'ui.element.identifier': 'my-image',
            'ui.element.url': 'https://santry.com/image.png',
          }),
        }),
        expect.any(Function),
      );
    });

    it('sets sentry attributes', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 100,
        duration: 0,
        renderTime: 100,
        identifier: 'my-image',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': 'ui.elementtiming',
            'sentry.origin': 'auto.ui.browser.elementtiming',
            'sentry.source': 'component',
            'sentry.transaction_name': undefined,
          }),
        }),
        expect.any(Function),
      );
    });
  });
});

describe('startTrackingElementTiming', () => {
  const addInstrumentationHandlerSpy = vi.spyOn(browserMetricsInstrumentation, 'addPerformanceInstrumentationHandler');

  beforeEach(() => {
    addInstrumentationHandlerSpy.mockClear();
  });

  it('returns a function that does nothing if the browser does not support the performance API', () => {
    vi.spyOn(browserMetricsUtils, 'getBrowserPerformanceAPI').mockReturnValue(undefined);
    expect(typeof startTrackingElementTiming()).toBe('function');

    expect(addInstrumentationHandlerSpy).not.toHaveBeenCalled();
  });

  it('adds an instrumentation handler for elementtiming entries, if the browser supports the performance API', () => {
    vi.spyOn(browserMetricsUtils, 'getBrowserPerformanceAPI').mockReturnValue({
      getEntriesByType: vi.fn().mockReturnValue([]),
    } as unknown as Performance);

    const addInstrumentationHandlerSpy = vi.spyOn(
      browserMetricsInstrumentation,
      'addPerformanceInstrumentationHandler',
    );

    const stopTracking = startTrackingElementTiming();

    expect(typeof stopTracking).toBe('function');

    expect(addInstrumentationHandlerSpy).toHaveBeenCalledWith('element', expect.any(Function));
  });
});
