import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _onElementTiming, startTrackingElementTiming } from '../../src/metrics/elementTiming';
import * as browserMetricsInstrumentation from '../../src/metrics/instrument';
import * as browserMetricsUtils from '../../src/metrics/utils';

describe('_onElementTiming', () => {
  const spanEndSpy = vi.fn();
  const startSpanSpy = vi.spyOn(sentryCore, 'startSpan').mockImplementation((opts, cb) => {
    // @ts-expect-error - only passing a partial span. This is fine for the test.
    cb({
      end: spanEndSpy,
    });
  });

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

  describe('span start time', () => {
    it('uses the load time as span start time if available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        renderTime: 100,
        loadTime: 50,
        identifier: 'test-element',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: 0.05,
          attributes: expect.objectContaining({
            'sentry.op': 'ui.elementtiming',
            'sentry.origin': 'auto.ui.browser.elementtiming',
            'sentry.source': 'component',
            'sentry.span_start_time_source': 'load-time',
            'element.render_time': 100,
            'element.load_time': 50,
            'element.identifier': 'test-element',
            'element.paint_type': 'image-paint',
          }),
        }),
        expect.any(Function),
      );
    });

    it('uses the render time as span start time if load time is not available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        renderTime: 100,
        identifier: 'test-element',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: 0.1,
          attributes: expect.objectContaining({
            'sentry.op': 'ui.elementtiming',
            'sentry.origin': 'auto.ui.browser.elementtiming',
            'sentry.source': 'component',
            'sentry.span_start_time_source': 'render-time',
            'element.render_time': 100,
            'element.load_time': undefined,
            'element.identifier': 'test-element',
            'element.paint_type': 'image-paint',
          }),
        }),
        expect.any(Function),
      );
    });

    it('falls back to the time of handling the entry if load and render time are not available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        identifier: 'test-element',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: expect.any(Number),
          attributes: expect.objectContaining({
            'sentry.op': 'ui.elementtiming',
            'sentry.origin': 'auto.ui.browser.elementtiming',
            'sentry.source': 'component',
            'sentry.span_start_time_source': 'entry-emission',
            'element.render_time': undefined,
            'element.load_time': undefined,
            'element.identifier': 'test-element',
            'element.paint_type': 'image-paint',
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
        startTime: 0,
        duration: 0,
        renderTime: 1505,
        loadTime: 1500,
        identifier: 'test-element',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: 1.5,
          attributes: expect.objectContaining({
            'element.render_time': 1505,
            'element.load_time': 1500,
            'element.paint_type': 'image-paint',
          }),
        }),
        expect.any(Function),
      );

      expect(spanEndSpy).toHaveBeenCalledWith(1.505);
    });

    it('uses 0 as duration for text paints', () => {
      const entry = {
        name: 'text-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        loadTime: 0,
        renderTime: 1600,
        identifier: 'test-element',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: 1.6,
          attributes: expect.objectContaining({
            'element.paint_type': 'text-paint',
            'element.render_time': 1600,
            'element.load_time': 0,
          }),
        }),
        expect.any(Function),
      );

      expect(spanEndSpy).toHaveBeenCalledWith(1.6);
    });

    // per spec, no other kinds are supported but let's make sure we're defensive
    it('uses 0 as duration for other kinds of entries', () => {
      const entry = {
        name: 'somethingelse',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        loadTime: 0,
        renderTime: 1700,
        identifier: 'test-element',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'element[test-element]',
          startTime: 1.7,
          attributes: expect.objectContaining({
            'element.paint_type': 'somethingelse',
            'element.render_time': 1700,
            'element.load_time': 0,
          }),
        }),
        expect.any(Function),
      );

      expect(spanEndSpy).toHaveBeenCalledWith(1.7);
    });
  });

  describe('span attributes', () => {
    it('sets element type, identifier, paint type, load and render time', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        renderTime: 100,
        identifier: 'my-image',
        element: {
          tagName: 'IMG',
        },
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'element.type': 'img',
            'element.identifier': 'my-image',
            'element.paint_type': 'image-paint',
            'element.render_time': 100,
            'element.load_time': undefined,
            'element.size': undefined,
            'element.url': undefined,
          }),
        }),
        expect.any(Function),
      );
    });

    it('sets element size if available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        renderTime: 100,
        naturalWidth: 512,
        naturalHeight: 256,
        identifier: 'my-image',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'element.size': '512x256',
            'element.identifier': 'my-image',
          }),
        }),
        expect.any(Function),
      );
    });

    it('sets element url if available', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
        duration: 0,
        url: 'https://santry.com/image.png',
        identifier: 'my-image',
      } as Partial<PerformanceEventTiming>;

      // @ts-expect-error - only passing a partial entry. This is fine for the test.
      _onElementTiming({ entries: [entry] });

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'element.identifier': 'my-image',
            'element.url': 'https://santry.com/image.png',
          }),
        }),
        expect.any(Function),
      );
    });

    it('sets sentry attributes', () => {
      const entry = {
        name: 'image-paint',
        entryType: 'element',
        startTime: 0,
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
            'sentry.span_start_time_source': 'render-time',
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
