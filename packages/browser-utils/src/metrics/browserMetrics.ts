/* eslint-disable max-lines */
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, getActiveSpan, startInactiveSpan } from '@sentry/core';
import { setMeasurement } from '@sentry/core';
import type { Measurements, Span, SpanAttributes, StartSpanOptions } from '@sentry/types';
import { browserPerformanceTimeOrigin, getComponentName, htmlTreeAsString, logger, parseUrl } from '@sentry/utils';

import { spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import {
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
  addTtfbInstrumentationHandler,
} from './instrument';
import { WINDOW } from './types';
import { isMeasurementValue, startAndEndSpan } from './utils';
import { getNavigationEntry } from './web-vitals/lib/getNavigationEntry';
import { getVisibilityWatcher } from './web-vitals/lib/getVisibilityWatcher';

interface NavigatorNetworkInformation {
  readonly connection?: NetworkInformation;
}

// http://wicg.github.io/netinfo/#connection-types
type ConnectionType = 'bluetooth' | 'cellular' | 'ethernet' | 'mixed' | 'none' | 'other' | 'unknown' | 'wifi' | 'wimax';

// http://wicg.github.io/netinfo/#effectiveconnectiontype-enum
type EffectiveConnectionType = '2g' | '3g' | '4g' | 'slow-2g';

// http://wicg.github.io/netinfo/#dom-megabit
type Megabit = number;
// http://wicg.github.io/netinfo/#dom-millisecond
type Millisecond = number;

// http://wicg.github.io/netinfo/#networkinformation-interface
interface NetworkInformation extends EventTarget {
  // http://wicg.github.io/netinfo/#type-attribute
  readonly type?: ConnectionType;
  // http://wicg.github.io/netinfo/#effectivetype-attribute
  readonly effectiveType?: EffectiveConnectionType;
  // http://wicg.github.io/netinfo/#downlinkmax-attribute
  readonly downlinkMax?: Megabit;
  // http://wicg.github.io/netinfo/#downlink-attribute
  readonly downlink?: Megabit;
  // http://wicg.github.io/netinfo/#rtt-attribute
  readonly rtt?: Millisecond;
  // http://wicg.github.io/netinfo/#savedata-attribute
  readonly saveData?: boolean;
  // http://wicg.github.io/netinfo/#handling-changes-to-the-underlying-connection
  onchange?: EventListener;
}

// https://w3c.github.io/device-memory/#sec-device-memory-js-api
interface NavigatorDeviceMemory {
  readonly deviceMemory?: number;
}

const MAX_INT_AS_BYTES = 2147483647;

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
function msToSec(time: number): number {
  return time / 1000;
}

function getBrowserPerformanceAPI(): Performance | undefined {
  // @ts-expect-error we want to make sure all of these are available, even if TS is sure they are
  return WINDOW && WINDOW.addEventListener && WINDOW.performance;
}

let _performanceCursor: number = 0;

let _measurements: Measurements = {};
let _lcpEntry: LargestContentfulPaint | undefined;
let _clsEntry: LayoutShift | undefined;

/**
 * Start tracking web vitals.
 * The callback returned by this function can be used to stop tracking & ensure all measurements are final & captured.
 *
 * @returns A function that forces web vitals collection
 */
export function startTrackingWebVitals(): () => void {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin) {
    // @ts-expect-error we want to make sure all of these are available, even if TS is sure they are
    if (performance.mark) {
      WINDOW.performance.mark('sentry-tracing-init');
    }
    const fidCallback = _trackFID();
    const clsCallback = _trackCLS();
    const lcpCallback = _trackLCP();
    const ttfbCallback = _trackTtfb();

    return (): void => {
      fidCallback();
      clsCallback();
      lcpCallback();
      ttfbCallback();
    };
  }

  return () => undefined;
}

/**
 * Start tracking long tasks.
 */
export function startTrackingLongTasks(): void {
  addPerformanceInstrumentationHandler('longtask', ({ entries }) => {
    for (const entry of entries) {
      if (!getActiveSpan()) {
        return;
      }
      const startTime = msToSec((browserPerformanceTimeOrigin as number) + entry.startTime);
      const duration = msToSec(entry.duration);

      const span = startInactiveSpan({
        name: 'Main UI thread blocked',
        op: 'ui.long-task',
        startTime,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      });
      if (span) {
        span.end(startTime + duration);
      }
    }
  });
}

/**
 * Start tracking interaction events.
 */
export function startTrackingInteractions(): void {
  addPerformanceInstrumentationHandler('event', ({ entries }) => {
    for (const entry of entries) {
      if (!getActiveSpan()) {
        return;
      }

      if (entry.name === 'click') {
        const startTime = msToSec((browserPerformanceTimeOrigin as number) + entry.startTime);
        const duration = msToSec(entry.duration);

        const spanOptions: StartSpanOptions & Required<Pick<StartSpanOptions, 'attributes'>> = {
          name: htmlTreeAsString(entry.target),
          op: `ui.interaction.${entry.name}`,
          startTime: startTime,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
          },
        };

        const componentName = getComponentName(entry.target);
        if (componentName) {
          spanOptions.attributes['ui.component_name'] = componentName;
        }

        const span = startInactiveSpan(spanOptions);
        if (span) {
          span.end(startTime + duration);
        }
      }
    }
  });
}

/** Starts tracking the Cumulative Layout Shift on the current page. */
function _trackCLS(): () => void {
  return addClsInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }

    DEBUG_BUILD && logger.log('[Measurements] Adding CLS');
    _measurements['cls'] = { value: metric.value, unit: '' };
    _clsEntry = entry as LayoutShift;
  }, true);
}

/** Starts tracking the Largest Contentful Paint on the current page. */
function _trackLCP(): () => void {
  return addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }

    DEBUG_BUILD && logger.log('[Measurements] Adding LCP');
    _measurements['lcp'] = { value: metric.value, unit: 'millisecond' };
    _lcpEntry = entry as LargestContentfulPaint;
  }, true);
}

/** Starts tracking the First Input Delay on the current page. */
function _trackFID(): () => void {
  return addFidInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }

    const timeOrigin = msToSec(browserPerformanceTimeOrigin as number);
    const startTime = msToSec(entry.startTime);
    DEBUG_BUILD && logger.log('[Measurements] Adding FID');
    _measurements['fid'] = { value: metric.value, unit: 'millisecond' };
    _measurements['mark.fid'] = { value: timeOrigin + startTime, unit: 'second' };
  });
}

function _trackTtfb(): () => void {
  return addTtfbInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1];
    if (!entry) {
      return;
    }

    DEBUG_BUILD && logger.log('[Measurements] Adding TTFB');
    _measurements['ttfb'] = { value: metric.value, unit: 'millisecond' };
  });
}

/** Add performance related spans to a span */
export function addPerformanceEntries(span: Span): void {
  const performance = getBrowserPerformanceAPI();
  if (!performance || !WINDOW.performance.getEntries || !browserPerformanceTimeOrigin) {
    // Gatekeeper if performance API not available
    return;
  }

  DEBUG_BUILD && logger.log('[Tracing] Adding & adjusting spans using Performance API');
  const timeOrigin = msToSec(browserPerformanceTimeOrigin);

  const performanceEntries = performance.getEntries();

  const { op, start_timestamp: transactionStartTime } = spanToJSON(span);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  performanceEntries.slice(_performanceCursor).forEach((entry: Record<string, any>) => {
    const startTime = msToSec(entry.startTime);
    const duration = msToSec(entry.duration);

    if (op === 'navigation' && transactionStartTime && timeOrigin + startTime < transactionStartTime) {
      return;
    }

    switch (entry.entryType) {
      case 'navigation': {
        _addNavigationSpans(span, entry, timeOrigin);
        break;
      }
      case 'mark':
      case 'paint':
      case 'measure': {
        _addMeasureSpans(span, entry, startTime, duration, timeOrigin);

        // capture web vitals
        const firstHidden = getVisibilityWatcher();
        // Only report if the page wasn't hidden prior to the web vital.
        const shouldRecord = entry.startTime < firstHidden.firstHiddenTime;

        if (entry.name === 'first-paint' && shouldRecord) {
          DEBUG_BUILD && logger.log('[Measurements] Adding FP');
          _measurements['fp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        if (entry.name === 'first-contentful-paint' && shouldRecord) {
          DEBUG_BUILD && logger.log('[Measurements] Adding FCP');
          _measurements['fcp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        break;
      }
      case 'resource': {
        _addResourceSpans(span, entry, entry.name as string, startTime, duration, timeOrigin);
        break;
      }
      default:
      // Ignore other entry types.
    }
  });

  _performanceCursor = Math.max(performanceEntries.length - 1, 0);

  _trackNavigator(span);

  // Measurements are only available for pageload transactions
  if (op === 'pageload') {
    _addTtfbRequestTimeToMeasurements(_measurements);

    ['fcp', 'fp', 'lcp'].forEach(name => {
      if (!_measurements[name] || !transactionStartTime || timeOrigin >= transactionStartTime) {
        return;
      }
      // The web vitals, fcp, fp, lcp, and ttfb, all measure relative to timeOrigin.
      // Unfortunately, timeOrigin is not captured within the span span data, so these web vitals will need
      // to be adjusted to be relative to span.startTimestamp.
      const oldValue = _measurements[name].value;
      const measurementTimestamp = timeOrigin + msToSec(oldValue);

      // normalizedValue should be in milliseconds
      const normalizedValue = Math.abs((measurementTimestamp - transactionStartTime) * 1000);
      const delta = normalizedValue - oldValue;

      DEBUG_BUILD && logger.log(`[Measurements] Normalized ${name} from ${oldValue} to ${normalizedValue} (${delta})`);
      _measurements[name].value = normalizedValue;
    });

    const fidMark = _measurements['mark.fid'];
    if (fidMark && _measurements['fid']) {
      // create span for FID
      startAndEndSpan(span, fidMark.value, fidMark.value + msToSec(_measurements['fid'].value), {
        name: 'first input delay',
        op: 'ui.action',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      });

      // Delete mark.fid as we don't want it to be part of final payload
      delete _measurements['mark.fid'];
    }

    // If FCP is not recorded we should not record the cls value
    // according to the new definition of CLS.
    if (!('fcp' in _measurements)) {
      delete _measurements.cls;
    }

    Object.keys(_measurements).forEach(measurementName => {
      setMeasurement(measurementName, _measurements[measurementName].value, _measurements[measurementName].unit);
    });

    _tagMetricInfo(span);
  }

  _lcpEntry = undefined;
  _clsEntry = undefined;
  _measurements = {};
}

/** Create measure related spans */
export function _addMeasureSpans(
  span: Span,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: Record<string, any>,
  startTime: number,
  duration: number,
  timeOrigin: number,
): number {
  const measureStartTimestamp = timeOrigin + startTime;
  const measureEndTimestamp = measureStartTimestamp + duration;

  startAndEndSpan(span, measureStartTimestamp, measureEndTimestamp, {
    name: entry.name as string,
    op: entry.entryType as string,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
    },
  });

  return measureStartTimestamp;
}

/** Instrument navigation entries */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _addNavigationSpans(span: Span, entry: Record<string, any>, timeOrigin: number): void {
  ['unloadEvent', 'redirect', 'domContentLoadedEvent', 'loadEvent', 'connect'].forEach(event => {
    _addPerformanceNavigationTiming(span, entry, event, timeOrigin);
  });
  _addPerformanceNavigationTiming(span, entry, 'secureConnection', timeOrigin, 'TLS/SSL', 'connectEnd');
  _addPerformanceNavigationTiming(span, entry, 'fetch', timeOrigin, 'cache', 'domainLookupStart');
  _addPerformanceNavigationTiming(span, entry, 'domainLookup', timeOrigin, 'DNS');
  _addRequest(span, entry, timeOrigin);
}

/** Create performance navigation related spans */
function _addPerformanceNavigationTiming(
  span: Span,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: Record<string, any>,
  event: string,
  timeOrigin: number,
  name?: string,
  eventEnd?: string,
): void {
  const end = eventEnd ? (entry[eventEnd] as number | undefined) : (entry[`${event}End`] as number | undefined);
  const start = entry[`${event}Start`] as number | undefined;
  if (!start || !end) {
    return;
  }
  startAndEndSpan(span, timeOrigin + msToSec(start), timeOrigin + msToSec(end), {
    op: 'browser',
    name: name || event,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
    },
  });
}

/** Create request and response related spans */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _addRequest(span: Span, entry: Record<string, any>, timeOrigin: number): void {
  if (entry.responseEnd) {
    // It is possible that we are collecting these metrics when the page hasn't finished loading yet, for example when the HTML slowly streams in.
    // In this case, ie. when the document request hasn't finished yet, `entry.responseEnd` will be 0.
    // In order not to produce faulty spans, where the end timestamp is before the start timestamp, we will only collect
    // these spans when the responseEnd value is available. The backend (Relay) would drop the entire span if it contained faulty spans.
    startAndEndSpan(
      span,
      timeOrigin + msToSec(entry.requestStart as number),
      timeOrigin + msToSec(entry.responseEnd as number),
      {
        op: 'browser',
        name: 'request',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      },
    );

    startAndEndSpan(
      span,
      timeOrigin + msToSec(entry.responseStart as number),
      timeOrigin + msToSec(entry.responseEnd as number),
      {
        op: 'browser',
        name: 'response',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      },
    );
  }
}

export interface ResourceEntry extends Record<string, unknown> {
  initiatorType?: string;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  renderBlockingStatus?: string;
}

/** Create resource-related spans */
export function _addResourceSpans(
  span: Span,
  entry: ResourceEntry,
  resourceUrl: string,
  startTime: number,
  duration: number,
  timeOrigin: number,
): void {
  // we already instrument based on fetch and xhr, so we don't need to
  // duplicate spans here.
  if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
    return;
  }

  const parsedUrl = parseUrl(resourceUrl);

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
  };
  setResourceEntrySizeData(attributes, entry, 'transferSize', 'http.response_transfer_size');
  setResourceEntrySizeData(attributes, entry, 'encodedBodySize', 'http.response_content_length');
  setResourceEntrySizeData(attributes, entry, 'decodedBodySize', 'http.decoded_response_content_length');

  if ('renderBlockingStatus' in entry) {
    attributes['resource.render_blocking_status'] = entry.renderBlockingStatus;
  }
  if (parsedUrl.protocol) {
    attributes['url.scheme'] = parsedUrl.protocol.split(':').pop(); // the protocol returned by parseUrl includes a :, but OTEL spec does not, so we remove it.
  }

  if (parsedUrl.host) {
    attributes['server.address'] = parsedUrl.host;
  }

  attributes['url.same_origin'] = resourceUrl.includes(WINDOW.location.origin);

  const startTimestamp = timeOrigin + startTime;
  const endTimestamp = startTimestamp + duration;

  startAndEndSpan(span, startTimestamp, endTimestamp, {
    name: resourceUrl.replace(WINDOW.location.origin, ''),
    op: entry.initiatorType ? `resource.${entry.initiatorType}` : 'resource.other',
    attributes,
  });
}

/**
 * Capture the information of the user agent.
 */
function _trackNavigator(span: Span): void {
  const navigator = WINDOW.navigator as null | (Navigator & NavigatorNetworkInformation & NavigatorDeviceMemory);
  if (!navigator) {
    return;
  }

  // track network connectivity
  const connection = navigator.connection;
  if (connection) {
    if (connection.effectiveType) {
      span.setAttribute('effectiveConnectionType', connection.effectiveType);
    }

    if (connection.type) {
      span.setAttribute('connectionType', connection.type);
    }

    if (isMeasurementValue(connection.rtt)) {
      _measurements['connection.rtt'] = { value: connection.rtt, unit: 'millisecond' };
    }
  }

  if (isMeasurementValue(navigator.deviceMemory)) {
    span.setAttribute('deviceMemory', `${navigator.deviceMemory} GB`);
  }

  if (isMeasurementValue(navigator.hardwareConcurrency)) {
    span.setAttribute('hardwareConcurrency', String(navigator.hardwareConcurrency));
  }
}

/** Add LCP / CLS data to span to allow debugging */
function _tagMetricInfo(span: Span): void {
  if (_lcpEntry) {
    DEBUG_BUILD && logger.log('[Measurements] Adding LCP Data');

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

    span.setAttribute('lcp.size', _lcpEntry.size);
  }

  // See: https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift
  if (_clsEntry && _clsEntry.sources) {
    DEBUG_BUILD && logger.log('[Measurements] Adding CLS Data');
    _clsEntry.sources.forEach((source, index) =>
      span.setAttribute(`cls.source.${index + 1}`, htmlTreeAsString(source.node)),
    );
  }
}

function setResourceEntrySizeData(
  attributes: SpanAttributes,
  entry: ResourceEntry,
  key: keyof Pick<ResourceEntry, 'transferSize' | 'encodedBodySize' | 'decodedBodySize'>,
  dataKey: 'http.response_transfer_size' | 'http.response_content_length' | 'http.decoded_response_content_length',
): void {
  const entryVal = entry[key];
  if (entryVal != null && entryVal < MAX_INT_AS_BYTES) {
    attributes[dataKey] = entryVal;
  }
}

/**
 * Add ttfb request time information to measurements.
 *
 * ttfb information is added via vendored web vitals library.
 */
function _addTtfbRequestTimeToMeasurements(_measurements: Measurements): void {
  const navEntry = getNavigationEntry();
  if (!navEntry) {
    return;
  }

  const { responseStart, requestStart } = navEntry;

  if (requestStart <= responseStart) {
    DEBUG_BUILD && logger.log('[Measurements] Adding TTFB Request Time');
    _measurements['ttfb.requestTime'] = {
      value: responseStart - requestStart,
      unit: 'millisecond',
    };
  }
}
