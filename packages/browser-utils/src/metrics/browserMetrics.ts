/* eslint-disable max-lines */
import type { Measurements, Span, SpanAttributes, StartSpanOptions } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  browserPerformanceTimeOrigin,
  getActiveSpan,
  getComponentName,
  htmlTreeAsString,
  parseUrl,
  setMeasurement,
  spanToJSON,
} from '@sentry/core';
import { WINDOW } from '../types';
import { trackClsAsStandaloneSpan } from './cls';
import {
  type PerformanceLongAnimationFrameTiming,
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
  addTtfbInstrumentationHandler,
} from './instrument';
import { getBrowserPerformanceAPI, isMeasurementValue, msToSec, startAndEndSpan } from './utils';
import { getActivationStart } from './web-vitals/lib/getActivationStart';
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

let _performanceCursor: number = 0;

let _measurements: Measurements = {};
let _lcpEntry: LargestContentfulPaint | undefined;
let _clsEntry: LayoutShift | undefined;

interface StartTrackingWebVitalsOptions {
  recordClsStandaloneSpans: boolean;
}

/**
 * Start tracking web vitals.
 * The callback returned by this function can be used to stop tracking & ensure all measurements are final & captured.
 *
 * @returns A function that forces web vitals collection
 */
export function startTrackingWebVitals({ recordClsStandaloneSpans }: StartTrackingWebVitalsOptions): () => void {
  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin) {
    // @ts-expect-error we want to make sure all of these are available, even if TS is sure they are
    if (performance.mark) {
      WINDOW.performance.mark('sentry-tracing-init');
    }
    const fidCleanupCallback = _trackFID();
    const lcpCleanupCallback = _trackLCP();
    const ttfbCleanupCallback = _trackTtfb();
    const clsCleanupCallback = recordClsStandaloneSpans ? trackClsAsStandaloneSpan() : _trackCLS();

    return (): void => {
      fidCleanupCallback();
      lcpCleanupCallback();
      ttfbCleanupCallback();
      clsCleanupCallback && clsCleanupCallback();
    };
  }

  return () => undefined;
}

/**
 * Start tracking long tasks.
 */
export function startTrackingLongTasks(): void {
  addPerformanceInstrumentationHandler('longtask', ({ entries }) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }

    const { op: parentOp, start_timestamp: parentStartTimestamp } = spanToJSON(parent);

    for (const entry of entries) {
      const startTime = msToSec((browserPerformanceTimeOrigin as number) + entry.startTime);
      const duration = msToSec(entry.duration);

      if (parentOp === 'navigation' && parentStartTimestamp && startTime < parentStartTimestamp) {
        // Skip adding a span if the long task started before the navigation started.
        // `startAndEndSpan` will otherwise adjust the parent's start time to the span's start
        // time, potentially skewing the duration of the actual navigation as reported via our
        // routing instrumentations
        continue;
      }

      startAndEndSpan(parent, startTime, startTime + duration, {
        name: 'Main UI thread blocked',
        op: 'ui.long-task',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
        },
      });
    }
  });
}

/**
 * Start tracking long animation frames.
 */
export function startTrackingLongAnimationFrames(): void {
  // NOTE: the current web-vitals version (3.5.2) does not support long-animation-frame, so
  // we directly observe `long-animation-frame` events instead of through the web-vitals
  // `observe` helper function.
  const observer = new PerformanceObserver(list => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }
    for (const entry of list.getEntries() as PerformanceLongAnimationFrameTiming[]) {
      if (!entry.scripts[0]) {
        continue;
      }

      const startTime = msToSec((browserPerformanceTimeOrigin as number) + entry.startTime);

      const { start_timestamp: parentStartTimestamp, op: parentOp } = spanToJSON(parent);

      if (parentOp === 'navigation' && parentStartTimestamp && startTime < parentStartTimestamp) {
        // Skip adding the span if the long animation frame started before the navigation started.
        // `startAndEndSpan` will otherwise adjust the parent's start time to the span's start
        // time, potentially skewing the duration of the actual navigation as reported via our
        // routing instrumentations
        continue;
      }

      const duration = msToSec(entry.duration);

      const attributes: SpanAttributes = {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
      };

      const initialScript = entry.scripts[0];
      const { invoker, invokerType, sourceURL, sourceFunctionName, sourceCharPosition } = initialScript;
      attributes['browser.script.invoker'] = invoker;
      attributes['browser.script.invoker_type'] = invokerType;
      if (sourceURL) {
        attributes['code.filepath'] = sourceURL;
      }
      if (sourceFunctionName) {
        attributes['code.function'] = sourceFunctionName;
      }
      if (sourceCharPosition !== -1) {
        attributes['browser.script.source_char_position'] = sourceCharPosition;
      }

      startAndEndSpan(parent, startTime, startTime + duration, {
        name: 'Main UI thread blocked',
        op: 'ui.long-animation-frame',
        attributes,
      });
    }
  });

  observer.observe({ type: 'long-animation-frame', buffered: true });
}

/**
 * Start tracking interaction events.
 */
export function startTrackingInteractions(): void {
  addPerformanceInstrumentationHandler('event', ({ entries }) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }
    for (const entry of entries) {
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

        startAndEndSpan(parent, startTime, startTime + duration, spanOptions);
      }
    }
  });
}

export { registerInpInteractionListener, startTrackingINP } from './inp';

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
    if (!entry) {
      return;
    }

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

    _measurements['ttfb'] = { value: metric.value, unit: 'millisecond' };
  });
}

interface AddPerformanceEntriesOptions {
  /**
   * Flag to determine if CLS should be recorded as a measurement on the span or
   * sent as a standalone span instead.
   */
  recordClsOnPageloadSpan: boolean;
}

/** Add performance related spans to a transaction */
export function addPerformanceEntries(span: Span, options: AddPerformanceEntriesOptions): void {
  const performance = getBrowserPerformanceAPI();
  if (!performance || !WINDOW.performance.getEntries || !browserPerformanceTimeOrigin) {
    // Gatekeeper if performance API not available
    return;
  }

  const timeOrigin = msToSec(browserPerformanceTimeOrigin);

  const performanceEntries = performance.getEntries();

  const { op, start_timestamp: transactionStartTime } = spanToJSON(span);

  performanceEntries.slice(_performanceCursor).forEach(entry => {
    const startTime = msToSec(entry.startTime);
    const duration = msToSec(
      // Inexplicably, Chrome sometimes emits a negative duration. We need to work around this.
      // There is a SO post attempting to explain this, but it leaves one with open questions: https://stackoverflow.com/questions/23191918/peformance-getentries-and-negative-duration-display
      // The way we clamp the value is probably not accurate, since we have observed this happen for things that may take a while to load, like for example the replay worker.
      // TODO: Investigate why this happens and how to properly mitigate. For now, this is a workaround to prevent transactions being dropped due to negative duration spans.
      Math.max(0, entry.duration),
    );

    if (op === 'navigation' && transactionStartTime && timeOrigin + startTime < transactionStartTime) {
      return;
    }

    switch (entry.entryType) {
      case 'navigation': {
        _addNavigationSpans(span, entry as PerformanceNavigationTiming, timeOrigin);
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
          _measurements['fp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        if (entry.name === 'first-contentful-paint' && shouldRecord) {
          _measurements['fcp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        break;
      }
      case 'resource': {
        _addResourceSpans(span, entry as PerformanceResourceTiming, entry.name, startTime, duration, timeOrigin);
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
    // TODO: Check if the first condition is still necessary: `onCLS` already only fires once `onFCP` was called.
    if (!('fcp' in _measurements) || !options.recordClsOnPageloadSpan) {
      delete _measurements.cls;
    }

    Object.entries(_measurements).forEach(([measurementName, measurement]) => {
      setMeasurement(measurementName, measurement.value, measurement.unit);
    });

    // Set timeOrigin which denotes the timestamp which to base the LCP/FCP/FP/TTFB measurements on
    span.setAttribute('performance.timeOrigin', timeOrigin);

    // In prerendering scenarios, where a page might be prefetched and pre-rendered before the user clicks the link,
    // the navigation starts earlier than when the user clicks it. Web Vitals should always be based on the
    // user-perceived time, so they are not reported from the actual start of the navigation, but rather from the
    // time where the user actively started the navigation, for example by clicking a link.
    // This is user action is called "activation" and the time between navigation and activation is stored in
    // the `activationStart` attribute of the "navigation" PerformanceEntry.
    span.setAttribute('performance.activationStart', getActivationStart());

    _setWebVitalAttributes(span);
  }

  _lcpEntry = undefined;
  _clsEntry = undefined;
  _measurements = {};
}

/** Create measure related spans */
export function _addMeasureSpans(
  span: Span,
  entry: PerformanceEntry,
  startTime: number,
  duration: number,
  timeOrigin: number,
): number {
  const navEntry = getNavigationEntry(false);
  const requestTime = msToSec(navEntry ? navEntry.requestStart : 0);
  // Because performance.measure accepts arbitrary timestamps it can produce
  // spans that happen before the browser even makes a request for the page.
  //
  // An example of this is the automatically generated Next.js-before-hydration
  // spans created by the Next.js framework.
  //
  // To prevent this we will pin the start timestamp to the request start time
  // This does make duration inaccurate, so if this does happen, we will add
  // an attribute to the span
  const measureStartTimestamp = timeOrigin + Math.max(startTime, requestTime);
  const startTimeStamp = timeOrigin + startTime;
  const measureEndTimestamp = startTimeStamp + duration;

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
  };

  if (measureStartTimestamp !== startTimeStamp) {
    attributes['sentry.browser.measure_happened_before_request'] = true;
    attributes['sentry.browser.measure_start_time'] = measureStartTimestamp;
  }

  startAndEndSpan(span, measureStartTimestamp, measureEndTimestamp, {
    name: entry.name as string,
    op: entry.entryType as string,
    attributes,
  });

  return measureStartTimestamp;
}

/** Instrument navigation entries */
function _addNavigationSpans(span: Span, entry: PerformanceNavigationTiming, timeOrigin: number): void {
  (['unloadEvent', 'redirect', 'domContentLoadedEvent', 'loadEvent', 'connect'] as const).forEach(event => {
    _addPerformanceNavigationTiming(span, entry, event, timeOrigin);
  });
  _addPerformanceNavigationTiming(span, entry, 'secureConnection', timeOrigin, 'TLS/SSL');
  _addPerformanceNavigationTiming(span, entry, 'fetch', timeOrigin, 'cache');
  _addPerformanceNavigationTiming(span, entry, 'domainLookup', timeOrigin, 'DNS');

  _addRequest(span, entry, timeOrigin);
}

/** Create performance navigation related spans */
function _addPerformanceNavigationTiming(
  span: Span,
  entry: PerformanceNavigationTiming,
  event:
    | 'secureConnection'
    | 'fetch'
    | 'domainLookup'
    | 'unloadEvent'
    | 'redirect'
    | 'connect'
    | 'domContentLoadedEvent'
    | 'loadEvent',
  timeOrigin: number,
  name?: string,
): void {
  const eventEnd = getEndPropertyNameForNavigationTiming(event);
  const end = entry[eventEnd];
  const start = entry[`${event}Start`];
  if (typeof start !== 'number' || typeof end !== 'number') {
    return;
  }
  startAndEndSpan(span, timeOrigin + msToSec(start), timeOrigin + msToSec(end), {
    op: `browser.${name || event}`,
    name: entry.name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
    },
  });
}

function getEndPropertyNameForNavigationTiming(
  event:
    | 'secureConnection'
    | 'fetch'
    | 'domainLookup'
    | 'unloadEvent'
    | 'redirect'
    | 'connect'
    | 'domContentLoadedEvent'
    | 'loadEvent',
): keyof PerformanceNavigationTiming {
  if (event === 'secureConnection') {
    return 'connectEnd';
  }
  if (event === 'fetch') {
    return 'domainLookupStart';
  }
  return `${event}End`;
}

/** Create request and response related spans */
function _addRequest(span: Span, entry: PerformanceNavigationTiming, timeOrigin: number): void {
  const requestStartTimestamp = timeOrigin + msToSec(entry.requestStart as number);
  const responseEndTimestamp = timeOrigin + msToSec(entry.responseEnd as number);
  const responseStartTimestamp = timeOrigin + msToSec(entry.responseStart as number);
  if (entry.responseEnd) {
    // It is possible that we are collecting these metrics when the page hasn't finished loading yet, for example when the HTML slowly streams in.
    // In this case, ie. when the document request hasn't finished yet, `entry.responseEnd` will be 0.
    // In order not to produce faulty spans, where the end timestamp is before the start timestamp, we will only collect
    // these spans when the responseEnd value is available. The backend (Relay) would drop the entire span if it contained faulty spans.
    startAndEndSpan(span, requestStartTimestamp, responseEndTimestamp, {
      op: 'browser.request',
      name: entry.name,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
      },
    });

    startAndEndSpan(span, responseStartTimestamp, responseEndTimestamp, {
      op: 'browser.response',
      name: entry.name,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
      },
    });
  }
}

/** Create resource-related spans */
function _addResourceSpans(
  span: Span,
  entry: PerformanceResourceTiming,
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

  // `deliveryType` is experimental and does not exist everywhere
  const deliveryType = (entry as { deliveryType?: 'cache' | 'navigational-prefetch' | '' }).deliveryType;
  if (deliveryType != null) {
    attributes['http.response_delivery_type'] = deliveryType;
  }

  // Types do not reflect this property yet
  const renderBlockingStatus = (entry as { renderBlockingStatus?: 'render-blocking' | 'non-render-blocking' })
    .renderBlockingStatus;
  if (renderBlockingStatus) {
    attributes['resource.render_blocking_status'] = renderBlockingStatus;
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
function _setWebVitalAttributes(span: Span): void {
  if (_lcpEntry) {
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

  // See: https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift
  if (_clsEntry && _clsEntry.sources) {
    _clsEntry.sources.forEach((source, index) =>
      span.setAttribute(`cls.source.${index + 1}`, htmlTreeAsString(source.node)),
    );
  }
}

function setResourceEntrySizeData(
  attributes: SpanAttributes,
  entry: PerformanceResourceTiming,
  key: keyof Pick<PerformanceResourceTiming, 'transferSize' | 'encodedBodySize' | 'decodedBodySize'>,
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
