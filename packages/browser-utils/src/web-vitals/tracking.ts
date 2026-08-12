import type { Client, Measurements, Span } from '@sentry/core';
import { browserPerformanceTimeOrigin, debug, setMeasurement, spanToStreamedSpanJSON } from '@sentry/core';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../debug-build';
import { htmlTreeAsString } from '../htmlTreeAsString';
import {
  addClsInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
  addTtfbInstrumentationHandler,
} from '../instrumentation/performanceObserver';
import { getBrowserPerformanceAPI, msToSec } from '../performance/utils';
import { isValidLcpMetric } from './lcp';
import { getActivationStart, getNavigationEntry, getVisibilityWatcher } from './utils';

let _measurements: Measurements = {};
let _lcpEntry: LargestContentfulPaint | undefined;
let _clsEntry: LayoutShift | undefined;

interface StartTrackingWebVitalsOptions {
  trackCls: boolean;
  trackLcp: boolean;
  client: Client;
}

/**
 * Start tracking web vitals.
 * The callback returned by this function can be used to stop tracking & ensure all measurements are final & captured.
 *
 * @returns A function that forces web vitals collection
 */
export function startTrackingWebVitals({ trackCls, trackLcp }: StartTrackingWebVitalsOptions): () => void {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin()) {
    const lcpCleanupCallback = trackLcp ? _trackLCP() : undefined;
    const clsCleanupCallback = trackCls ? _trackCLS() : undefined;
    const ttfbCleanupCallback = _trackTtfb();
    const fpFcpCleanupCallback = _trackFpFcp();

    return (): void => {
      ttfbCleanupCallback();
      fpFcpCleanupCallback();
      lcpCleanupCallback?.();
      clsCleanupCallback?.();
    };
  }

  return () => undefined;
}

export { registerInpInteractionListener } from './inp';

/**
 * Starts tracking the Cumulative Layout Shift on the current page and collects the value and last entry
 * to the `_measurements` object which ultimately is applied to the pageload span's measurements.
 */
function _trackCLS(): () => void {
  return addClsInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
    if (!entry) {
      return;
    }
    _measurements['cls'] = { value: metric.value, unit: '' };
    _clsEntry = entry;
  }, true);
}

/** Starts tracking the Largest Contentful Paint on the current page. */
function _trackLCP(): () => void {
  return addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry || !isValidLcpMetric(metric.value)) {
      return;
    }

    _measurements['lcp'] = { value: metric.value, unit: 'millisecond' };
    _lcpEntry = entry as LargestContentfulPaint;
  }, true);
}

function _trackTtfb(): () => void {
  return addTtfbInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }

    _measurements['ttfb'] = { value: metric.value, unit: 'millisecond' };
  });
}

/** Starts tracking First Paint and First Contentful Paint on the current page. */
function _trackFpFcp(): () => void {
  return addPerformanceInstrumentationHandler('paint', ({ entries }) => {
    const firstHidden = getVisibilityWatcher();
    for (const entry of entries) {
      // Only report if the page wasn't hidden prior to the web vital.
      const shouldRecord = entry.startTime < firstHidden.firstHiddenTime;
      if (entry.name === 'first-paint' && shouldRecord) {
        _measurements['fp'] = { value: entry.startTime, unit: 'millisecond' };
      }
      if (entry.name === 'first-contentful-paint' && shouldRecord) {
        _measurements['fcp'] = { value: entry.startTime, unit: 'millisecond' };
      }
    }
  });
}

interface AddWebVitalsToSpanOptions {
  /**
   * Flag to determine if CLS should be recorded as a measurement on the pageload span or
   * sent as a standalone span instead.
   * Sending it as a standalone span will yield more accurate LCP values.
   *
   * Default: `false` for backwards compatibility.
   */
  recordClsOnPageloadSpan: boolean;

  /**
   * Flag to determine if LCP should be recorded as a measurement on the pageload span or
   * sent as a standalone span instead.
   * Sending it as a standalone span will yield more accurate LCP values.
   *
   * Default: `false` for backwards compatibility.
   */
  recordLcpOnPageloadSpan: boolean;

  /**
   * Whether span streaming is enabled.
   */
  spanStreamingEnabled?: boolean;
}

/**
 * Writes the collected web vitals (LCP, CLS, INP, TTFB, FP, FCP) onto the pageload span,
 * either as measurements/attributes (v1) or as web vital attributes (span streaming).
 *
 * This should be called when the pageload span ends, after the web vitals have been finalized.
 * It is a no-op for non-pageload spans, but always resets the collected web vital state so it
 * doesn't leak into a subsequent navigation.
 */
export function addWebVitalsToSpan(span: Span, options: AddWebVitalsToSpanOptions): void {
  const origin = browserPerformanceTimeOrigin();
  if (!getBrowserPerformanceAPI()?.getEntries || !origin) {
    // Gatekeeper if performance API not available
    resetWebVitalState();
    return;
  }

  const { spanStreamingEnabled, recordClsOnPageloadSpan, recordLcpOnPageloadSpan } = options;
  const timeOrigin = msToSec(origin);

  // Measurements are only available for pageload transactions
  if (spanToStreamedSpanJSON(span).attributes[SENTRY_OP] === 'pageload') {
    _addTtfbRequestTimeToMeasurements(_measurements);

    if (spanStreamingEnabled) {
      const setAttr = (shortWebVitalName: string, value: number, customAttrName?: string) => {
        const attrKey = customAttrName ?? `browser.web_vital.${shortWebVitalName}.value`;
        span.setAttribute(attrKey, value);
        DEBUG_BUILD && debug.log('Setting web vital attribute', { [attrKey]: value }, 'on pageload span');
      };
      // for streamed pageload spans, we add the web vital measurements as attributes.
      // We omit LCP, CLS and INP because they're tracked separately as spans
      ['ttfb', 'fp', 'fcp'].forEach(measurementName => {
        if (_measurements[measurementName]) {
          setAttr(measurementName, _measurements[measurementName].value);
        }
      });
      if (_measurements['ttfb.requestTime']) {
        setAttr('ttfb.requestTime', _measurements['ttfb.requestTime'].value, 'browser.web_vital.ttfb.request_time');
      }
    } else {
      // If CLS is tracked as a span (span streaming), don't record CLS as a measurement
      if (!recordClsOnPageloadSpan) {
        delete _measurements.cls;
      }

      // If LCP is tracked as a span (span streaming), don't record LCP as a measurement
      if (!recordLcpOnPageloadSpan) {
        delete _measurements.lcp;
      }

      Object.entries(_measurements).forEach(([measurementName, measurement]) => {
        setMeasurement(measurementName, measurement.value, measurement.unit, span);
      });

      _setWebVitalAttributes(span, options);
    }

    // Set timeOrigin which denotes the timestamp which to base the LCP/FCP/FP/TTFB measurements on
    span.setAttribute(spanStreamingEnabled ? 'browser.performance.time_origin' : 'performance.timeOrigin', timeOrigin);

    // In prerendering scenarios, where a page might be prefetched and pre-rendered before the user clicks the link,
    // the navigation starts earlier than when the user clicks it. Web Vitals should always be based on the
    // user-perceived time, so they are not reported from the actual start of the navigation, but rather from the
    // time where the user actively started the navigation, for example by clicking a link.
    // This is user action is called "activation" and the time between navigation and activation is stored in
    // the `activationStart` attribute of the "navigation" PerformanceEntry.
    span.setAttribute(
      spanStreamingEnabled ? 'browser.performance.navigation.activation_start' : 'performance.activationStart',
      getActivationStart(),
    );
  }

  resetWebVitalState();
}

function resetWebVitalState(): void {
  _lcpEntry = undefined;
  _clsEntry = undefined;
  _measurements = {};
}

/** Add LCP / CLS data to span to allow debugging */
function _setWebVitalAttributes(span: Span, options: AddWebVitalsToSpanOptions): void {
  // Only add LCP attributes if LCP is being recorded on the pageload span
  if (_lcpEntry && options.recordLcpOnPageloadSpan) {
    // Capture Properties of the LCP element that contributes to the LCP.

    if (_lcpEntry.element) {
      span.setAttribute('lcp.element', htmlTreeAsString(_lcpEntry.element));
    }

    if (_lcpEntry.id) {
      span.setAttribute('lcp.id', _lcpEntry.id);
    }

    if (_lcpEntry.url) {
      // Trim URL to the first 200 characters.
      span.setAttribute('lcp.url', _lcpEntry.url.trim().slice(0, 200));
    }

    if (_lcpEntry.loadTime != null) {
      // loadTime is the time of LCP that's related to receiving the LCP element response..
      span.setAttribute('lcp.loadTime', _lcpEntry.loadTime);
    }

    if (_lcpEntry.renderTime != null) {
      // renderTime is loadTime + rendering time
      // it's 0 if the LCP element is loaded from a 3rd party origin that doesn't send the
      // `Timing-Allow-Origin` header.
      span.setAttribute('lcp.renderTime', _lcpEntry.renderTime);
    }

    span.setAttribute('lcp.size', _lcpEntry.size);
  }

  // Only add CLS attributes if CLS is being recorded on the pageload span
  if (_clsEntry?.sources && options.recordClsOnPageloadSpan) {
    _clsEntry.sources.forEach((source, index) =>
      span.setAttribute(`cls.source.${index + 1}`, htmlTreeAsString(source.node)),
    );
  }
}

/**
 * Add ttfb request time information to measurements.
 *
 * ttfb information is added via the web vitals library.
 */
function _addTtfbRequestTimeToMeasurements(_measurements: Measurements): void {
  const navEntry = getNavigationEntry(false);
  if (!navEntry) {
    return;
  }

  const { responseStart, requestStart } = navEntry;

  if (requestStart <= responseStart) {
    _measurements['ttfb.requestTime'] = {
      value: responseStart - requestStart,
      unit: 'millisecond',
    };
  }
}
