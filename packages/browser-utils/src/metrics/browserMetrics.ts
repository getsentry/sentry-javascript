/* eslint-disable max-lines */
import type { Measurements, Span, SpanAttributes, SpanAttributeValue, StartSpanOptions } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  getActiveSpan,
  getComponentName,
  htmlTreeAsString,
  isPrimitive,
  parseUrl,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  stringMatchesSomePattern,
} from '@sentry/core';
import { WINDOW } from '../types';
import {
  addPerformanceInstrumentationHandler,
  addTtfbInstrumentationHandler,
  type PerformanceLongAnimationFrameTiming,
} from './instrument';
import { resourceTimingToSpanAttributes } from './resourceTiming';
import { getBrowserPerformanceAPI, isMeasurementValue, msToSec, startAndEndSpan } from './utils';
import { getActivationStart } from './web-vitals/lib/getActivationStart';
import { getNavigationEntry } from './web-vitals/lib/getNavigationEntry';
import { getVisibilityWatcher } from './web-vitals/lib/getVisibilityWatcher';
import { DEBUG_BUILD } from '../debug-build';
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

type PageloadWebVitalName = 'ttfb' | 'fp' | 'fcp';

const DEFAULT_PAGELOAD_WEB_VITALS = new Set<PageloadWebVitalName>(['ttfb', 'fp', 'fcp']);

let _enabledPageloadWebVitals = DEFAULT_PAGELOAD_WEB_VITALS;

let _collectTtfb: (() => void) | undefined;

/**
 * Start tracking web vitals.
 *
 * LCP, CLS and INP are handled separately as spans by `webVitalsIntegration`;
 * this function tracks pageload web vitals which are attached as attributes.
 */
export function startTrackingWebVitals(options: { disable?: Array<'ttfb' | 'fp' | 'fcp'> } = {}): void {
  _collectTtfb?.();
  _collectTtfb = undefined;

  _enabledPageloadWebVitals = new Set(
    Array.from(DEFAULT_PAGELOAD_WEB_VITALS).filter(vital => !options.disable?.includes(vital)),
  );

  const performance = getBrowserPerformanceAPI();
  if (performance && browserPerformanceTimeOrigin()) {
    // @ts-expect-error we want to make sure all of these are available, even if TS is sure they are
    if (performance.mark) {
      WINDOW.performance.mark('sentry-tracing-init');
    }

    if (_enabledPageloadWebVitals.has('ttfb')) {
      _collectTtfb = _trackTtfb();
    }
  }
}

function collectWebVitals(): void {
  _collectTtfb?.();
  _collectTtfb = undefined;
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
      const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
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

      const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);

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
        const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
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

interface AddPerformanceEntriesOptions {
  /**
   * Resource spans with `op`s matching strings in the array will not be emitted.
   *
   * Default: []
   */
  ignoreResourceSpans: Array<'resouce.script' | 'resource.css' | 'resource.img' | 'resource.other' | string>;

  /**
   * Performance spans created from browser Performance APIs,
   * `performance.mark(...)` nand `performance.measure(...)`
   * with `name`s matching strings in the array will not be emitted.
   *
   * Default: []
   */
  ignorePerformanceApiSpans: Array<string | RegExp>;
}

/** Add performance related spans to a transaction */
export function addPerformanceEntries(span: Span, options: AddPerformanceEntriesOptions): void {
  collectWebVitals();

  const performance = getBrowserPerformanceAPI();
  const origin = browserPerformanceTimeOrigin();
  if (!performance?.getEntries || !origin) {
    // Gatekeeper if performance API not available
    return;
  }

  const { ignorePerformanceApiSpans, ignoreResourceSpans } = options;

  const timeOrigin = msToSec(origin);

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
        _addMeasureSpans(span, entry, startTime, duration, timeOrigin, ignorePerformanceApiSpans);

        // capture web vitals
        const firstHidden = getVisibilityWatcher();
        // Only report if the page wasn't hidden prior to the web vital.
        const shouldRecord = entry.startTime < firstHidden.firstHiddenTime;

        if (entry.name === 'first-paint' && shouldRecord && _enabledPageloadWebVitals.has('fp')) {
          _measurements['fp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        if (entry.name === 'first-contentful-paint' && shouldRecord && _enabledPageloadWebVitals.has('fcp')) {
          _measurements['fcp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        break;
      }
      case 'resource': {
        _addResourceSpans(
          span,
          entry as PerformanceResourceTiming,
          entry.name,
          startTime,
          duration,
          timeOrigin,
          ignoreResourceSpans,
        );
        break;
      }
      // Ignore other entry types.
    }
  });

  _performanceCursor = Math.max(performanceEntries.length - 1, 0);

  _trackNavigator(span);

  // Measurements are only available for pageload transactions
  if (op === 'pageload') {
    if (_enabledPageloadWebVitals.has('ttfb')) {
      _addTtfbRequestTimeToMeasurements(_measurements);
    }

    const setAttr = (shortWebVitalName: string, value: number, customAttrName?: string): void => {
      const attrKey = customAttrName ?? `browser.web_vital.${shortWebVitalName}.value`;
      span.setAttribute(attrKey, value);
      DEBUG_BUILD && debug.log('Setting web vital attribute', { [attrKey]: value }, 'on pageload span');
    };
    // For streamed pageload spans, we add the web vital measurements as attributes.
    // LCP, CLS and INP are tracked separately as spans by `webVitalsIntegration`.
    ['ttfb', 'fp', 'fcp'].forEach(measurementName => {
      if (_measurements[measurementName]) {
        setAttr(measurementName, _measurements[measurementName].value);
      }
    });
    if (_measurements['ttfb.requestTime']) {
      setAttr('ttfb.requestTime', _measurements['ttfb.requestTime'].value, 'browser.web_vital.ttfb.request_time');
    }

    span.setAttribute('browser.performance.time_origin', timeOrigin);

    // In prerendering scenarios, where a page might be prefetched and pre-rendered before the user clicks the link,
    // the navigation starts earlier than when the user clicks it. Web Vitals should always be based on the
    // user-perceived time, so they are not reported from the actual start of the navigation, but rather from the
    // time where the user actively started the navigation, for example by clicking a link.
    // This is user action is called "activation" and the time between navigation and activation is stored in
    // the `activationStart` attribute of the "navigation" PerformanceEntry.
    span.setAttribute('browser.performance.navigation.activation_start', getActivationStart());
  }

  _measurements = {};
}

/**
 * React 19.2+ creates performance.measure entries for component renders.
 * We can identify them by the `detail.devtools.track` property being set to 'Components ⚛'.
 * see: https://react.dev/reference/dev-tools/react-performance-tracks
 * see: https://github.com/facebook/react/blob/06fcc8f380c6a905c7bc18d94453f623cf8cbc81/packages/react-reconciler/src/ReactFiberPerformanceTrack.js#L454-L473
 */
function isReact19MeasureEntry(entry: PerformanceEntry | null): boolean | void {
  if (entry?.entryType !== 'measure') {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (entry as PerformanceMeasure).detail.devtools.track === 'Components ⚛';
  } catch {
    return;
  }
}

/**
 * Create measure related spans.
 * Exported only for tests.
 */
export function _addMeasureSpans(
  span: Span,
  entry: PerformanceEntry,
  startTime: number,
  duration: number,
  timeOrigin: number,
  ignorePerformanceApiSpans: AddPerformanceEntriesOptions['ignorePerformanceApiSpans'],
): void {
  if (isReact19MeasureEntry(entry)) {
    return;
  }

  if (
    ['mark', 'measure'].includes(entry.entryType) &&
    stringMatchesSomePattern(entry.name, ignorePerformanceApiSpans)
  ) {
    return;
  }

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

  _addDetailToSpanAttributes(attributes, entry as PerformanceMeasure);

  // Measurements from third parties can be off, which would create invalid spans, dropping transactions in the process.
  if (measureStartTimestamp <= measureEndTimestamp) {
    startAndEndSpan(span, measureStartTimestamp, measureEndTimestamp, {
      name: entry.name,
      op: entry.entryType,
      attributes,
    });
  }
}

function _addDetailToSpanAttributes(attributes: SpanAttributes, performanceMeasure: PerformanceMeasure): void {
  try {
    // Accessing detail might throw in some browsers (e.g., Firefox) due to security restrictions
    const detail = performanceMeasure.detail;

    if (!detail) {
      return;
    }

    // Process detail based on its type
    if (typeof detail === 'object') {
      // Handle object details
      for (const [key, value] of Object.entries(detail)) {
        if (value && isPrimitive(value)) {
          attributes[`sentry.browser.measure.detail.${key}`] = value as SpanAttributeValue;
        } else if (value !== undefined) {
          try {
            // This is user defined so we can't guarantee it's serializable
            attributes[`sentry.browser.measure.detail.${key}`] = JSON.stringify(value);
          } catch {
            // Skip values that can't be stringified
          }
        }
      }
      return;
    }

    if (isPrimitive(detail)) {
      // Handle primitive details
      attributes['sentry.browser.measure.detail'] = detail as SpanAttributeValue;
      return;
    }

    try {
      attributes['sentry.browser.measure.detail'] = JSON.stringify(detail);
    } catch {
      // Skip if stringification fails
    }
  } catch {
    // Silently ignore any errors when accessing detail
    // This handles the Firefox "Permission denied to access object" error
  }
}

/**
 * Instrument navigation entries
 * exported only for tests
 */
export function _addNavigationSpans(span: Span, entry: PerformanceNavigationTiming, timeOrigin: number): void {
  (['unloadEvent', 'redirect', 'domContentLoadedEvent', 'loadEvent', 'connect'] as const).forEach(event => {
    _addPerformanceNavigationTiming(span, entry, event, timeOrigin);
  });
  _addPerformanceNavigationTiming(span, entry, 'secureConnection', timeOrigin, 'TLS/SSL');
  _addPerformanceNavigationTiming(span, entry, 'fetch', timeOrigin, 'cache');
  _addPerformanceNavigationTiming(span, entry, 'domainLookup', timeOrigin, 'DNS');

  _addRequest(span, entry, timeOrigin);
}

type StartEventName =
  | 'secureConnection'
  | 'fetch'
  | 'domainLookup'
  | 'unloadEvent'
  | 'redirect'
  | 'connect'
  | 'domContentLoadedEvent'
  | 'loadEvent';

type EndEventName =
  | 'domainLookupStart'
  | 'domainLookupEnd'
  | 'unloadEventEnd'
  | 'redirectEnd'
  | 'connectEnd'
  | 'domContentLoadedEventEnd'
  | 'loadEventEnd';

/** Create performance navigation related spans */
function _addPerformanceNavigationTiming(
  span: Span,
  entry: PerformanceNavigationTiming,
  event: StartEventName,
  timeOrigin: number,
  name: string = event,
): void {
  const eventEnd = _getEndPropertyNameForNavigationTiming(event) satisfies keyof PerformanceNavigationTiming;
  const end = entry[eventEnd];
  const start = entry[`${event}Start`];
  if (!start || !end) {
    return;
  }
  startAndEndSpan(span, timeOrigin + msToSec(start), timeOrigin + msToSec(end), {
    op: `browser.${name}`,
    name: entry.name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.browser.metrics',
      ...(event === 'redirect' && entry.redirectCount != null ? { 'http.redirect_count': entry.redirectCount } : {}),
    },
  });
}

function _getEndPropertyNameForNavigationTiming(event: StartEventName): EndEventName {
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
  const requestStartTimestamp = timeOrigin + msToSec(entry.requestStart);
  const responseEndTimestamp = timeOrigin + msToSec(entry.responseEnd);
  const responseStartTimestamp = timeOrigin + msToSec(entry.responseStart);
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

/**
 * Create resource-related spans.
 * Exported only for tests.
 */
export function _addResourceSpans(
  span: Span,
  entry: PerformanceResourceTiming,
  resourceUrl: string,
  startTime: number,
  duration: number,
  timeOrigin: number,
  ignoredResourceSpanOps?: Array<string>,
): void {
  // we already instrument based on fetch and xhr, so we don't need to
  // duplicate spans here.
  if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
    return;
  }

  const op = entry.initiatorType ? `resource.${entry.initiatorType}` : 'resource.other';
  if (ignoredResourceSpanOps?.includes(op)) {
    return;
  }

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
  };

  const parsedUrl = parseUrl(resourceUrl);

  if (parsedUrl.protocol) {
    attributes['url.scheme'] = parsedUrl.protocol.split(':').pop(); // the protocol returned by parseUrl includes a :, but OTEL spec does not, so we remove it.
  }

  if (parsedUrl.host) {
    attributes['server.address'] = parsedUrl.host;
  }

  attributes['url.same_origin'] = resourceUrl.includes(WINDOW.location.origin);

  _setResourceRequestAttributes(entry, attributes, [
    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
    ['responseStatus', 'http.response.status_code'],

    ['transferSize', 'http.response_transfer_size'],
    ['encodedBodySize', 'http.response_content_length'],
    ['decodedBodySize', 'http.decoded_response_content_length'],

    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/renderBlockingStatus
    ['renderBlockingStatus', 'resource.render_blocking_status'],

    // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
    ['deliveryType', 'http.response_delivery_type'],
  ]);

  const attributesWithResourceTiming: SpanAttributes = { ...attributes, ...resourceTimingToSpanAttributes(entry) };

  const startTimestamp = timeOrigin + startTime;
  const endTimestamp = startTimestamp + duration;

  startAndEndSpan(span, startTimestamp, endTimestamp, {
    name: resourceUrl.replace(WINDOW.location.origin, ''),
    op,
    attributes: attributesWithResourceTiming,
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
      span.setAttribute('network.connection.effective_type', connection.effectiveType);
    }

    if (connection.type) {
      span.setAttribute('network.connection.type', connection.type);
    }

    if (isMeasurementValue(connection.rtt)) {
      _measurements['connection.rtt'] = { value: connection.rtt, unit: 'millisecond' };
      span.setAttribute('network.connection.rtt', connection.rtt);
    }
  }

  if (isMeasurementValue(navigator.deviceMemory)) {
    span.setAttribute('device.memory.estimated_capacity', navigator.deviceMemory);
  }

  if (isMeasurementValue(navigator.hardwareConcurrency)) {
    span.setAttribute('device.processor_count', navigator.hardwareConcurrency);
  }
}

type ExperimentalResourceTimingProperty =
  | 'renderBlockingStatus'
  | 'deliveryType'
  // For some reason, TS during build, errors on `responseStatus` not being a property of
  // PerformanceResourceTiming while it actually is. Hence, we're adding it here.
  // Perhaps because response status is not yet available in Webkit/Safari.
  // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
  | 'responseStatus';

/**
 * Use this to set any attributes we can take directly form the PerformanceResourceTiming entry.
 *
 * This is just a mapping function for entry->attribute to keep bundle-size minimal.
 * Experimental properties are also accepted (see {@link ExperimentalResourceTimingProperty}).
 * Assumes that all entry properties might be undefined for browser-specific differences.
 * Only accepts string and number values for now and also sets 0-values.
 */
export function _setResourceRequestAttributes(
  entry: Partial<PerformanceResourceTiming> & Partial<Record<ExperimentalResourceTimingProperty, number | string>>,
  attributes: SpanAttributes,
  properties: [keyof PerformanceResourceTiming | ExperimentalResourceTimingProperty, string][],
): void {
  properties.forEach(([entryKey, attributeKey]) => {
    const entryVal = entry[entryKey];
    if (
      entryVal != null &&
      ((typeof entryVal === 'number' && entryVal < MAX_INT_AS_BYTES) || typeof entryVal === 'string')
    ) {
      attributes[attributeKey] = entryVal;
    }
  });
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
