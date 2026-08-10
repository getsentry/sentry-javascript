import type { Measurements, Span } from '@sentry/core';
import { browserPerformanceTimeOrigin, debug, spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import {
  addPerformanceInstrumentationHandler,
  addTtfbInstrumentationHandler,
} from '../instrumentation/performanceObserver';
import { getBrowserPerformanceAPI, msToSec } from '../performance/utils';
import { getActivationStart, getNavigationEntry, getVisibilityWatcher } from './utils';

let _measurements: Measurements = {};

/**
 * Start tracking web vitals.
 * The callback returned by this function can be used to stop tracking & ensure all measurements are final & captured.
 *
 * @returns A function that forces web vitals collection
 */
export function startTrackingWebVitals(): () => void {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin()) {
    const ttfbCleanupCallback = _trackTtfb();
    const fpFcpCleanupCallback = _trackFpFcp();

    return (): void => {
      ttfbCleanupCallback();
      fpFcpCleanupCallback();
    };
  }

  return () => undefined;
}

export { registerInpInteractionListener } from './inp';

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

/**
 * Writes the collected web vitals (TTFB, FP, FCP) onto the pageload span as web vital attributes.
 * LCP, CLS and INP are omitted because they are tracked separately as their own streamed spans.
 *
 * This should be called when the pageload span ends, after the web vitals have been finalized.
 * It is a no-op for non-pageload spans, but always resets the collected web vital state so it
 * doesn't leak into a subsequent navigation.
 */
export function addWebVitalsToSpan(span: Span): void {
  const origin = browserPerformanceTimeOrigin();
  if (!getBrowserPerformanceAPI()?.getEntries || !origin) {
    // Gatekeeper if performance API not available
    resetWebVitalState();
    return;
  }

  const timeOrigin = msToSec(origin);

  if (spanToJSON(span).op === 'pageload') {
    _addTtfbRequestTimeToMeasurements(_measurements);

    const setAttr = (shortWebVitalName: string, value: number, customAttrName?: string) => {
      const attrKey = customAttrName ?? `browser.web_vital.${shortWebVitalName}.value`;
      span.setAttribute(attrKey, value);
      DEBUG_BUILD && debug.log('Setting web vital attribute', { [attrKey]: value }, 'on pageload span');
    };

    ['ttfb', 'fp', 'fcp'].forEach(measurementName => {
      if (_measurements[measurementName]) {
        setAttr(measurementName, _measurements[measurementName].value);
      }
    });
    if (_measurements['ttfb.requestTime']) {
      setAttr('ttfb.requestTime', _measurements['ttfb.requestTime'].value, 'browser.web_vital.ttfb.request_time');
    }

    // Set timeOrigin which denotes the timestamp which to base the LCP/FCP/FP/TTFB measurements on
    span.setAttribute('browser.performance.time_origin', timeOrigin);

    // In prerendering scenarios, where a page might be prefetched and pre-rendered before the user clicks the link,
    // the navigation starts earlier than when the user clicks it. Web Vitals should always be based on the
    // user-perceived time, so they are not reported from the actual start of the navigation, but rather from the
    // time where the user actively started the navigation, for example by clicking a link.
    // This is user action is called "activation" and the time between navigation and activation is stored in
    // the `activationStart` attribute of the "navigation" PerformanceEntry.
    span.setAttribute('browser.performance.navigation.activation_start', getActivationStart());
  }

  resetWebVitalState();
}

function resetWebVitalState(): void {
  _measurements = {};
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
