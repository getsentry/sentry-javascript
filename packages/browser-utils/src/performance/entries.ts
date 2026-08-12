/* eslint-disable max-lines */
import type { Span, SpanAttributes, StartSpanOptions } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  getActiveSpan,
  getComponentName,
  parseUrl,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setMeasurement,
  spanToJSON,
  filterCollectedUrl,
} from '@sentry/core';
import { SENTRY_OP, URL_FULL } from '@sentry/conventions/attributes';
import { BROWSER_BROWSER_PAINT_SPAN_OP } from '@sentry/conventions/op';
import { htmlTreeAsString } from '../htmlTreeAsString';
import {
  addPerformanceInstrumentationHandler,
  type PerformanceLongAnimationFrameTiming,
} from '../instrumentation/performanceObserver';
import { WINDOW } from '../types';
import { resourceTimingToSpanAttributes } from './resourceTiming';
import { getBrowserPerformanceAPI, isMeasurementValue, msToSec, startAndEndSpan } from './utils';

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

/**
 * Start tracking long tasks.
 */
export function startTrackingLongTasks(): void {
  addPerformanceInstrumentationHandler('longtask', ({ entries }) => {
    const parent = getActiveSpan();
    if (!parent) {
      return;
    }

    const { attributes: parentAttributes, start_timestamp: parentStartTimestamp } = spanToJSON(parent);

    for (const entry of entries) {
      const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
      const duration = msToSec(entry.duration);

      if (parentAttributes[SENTRY_OP] === 'navigation' && parentStartTimestamp && startTime < parentStartTimestamp) {
        // Skip adding a span if the long task started before the navigation started.
        // `startAndEndSpan` will otherwise adjust the parent's start time to the span's start
        // time, potentially skewing the duration of the actual navigation as reported via our
        // routing instrumentations
        continue;
      }

      startAndEndSpan(parent, startTime, startTime + duration, {
        name: 'Main UI thread blocked',
        op: 'ui.long_task',
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

      const {
        start_timestamp: parentStartTimestamp,
        attributes: { [SENTRY_OP]: parentOp },
      } = spanToJSON(parent);

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
        op: 'ui.long_animation_frame',
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

interface AddPerformanceEntriesOptions {
  /**
   * Resource spans with `op`s matching strings in the array will not be emitted.
   *
   * Default: []
   */
  ignoreResourceSpans: Array<'resource.script' | 'resource.css' | 'resource.img' | 'resource.other' | string>;

  /**
   * Whether span streaming is enabled.
   */
  spanStreamingEnabled?: boolean;
}

/** Add performance related spans to a transaction */
export function addPerformanceEntries(span: Span, options: AddPerformanceEntriesOptions): void {
  const performance = getBrowserPerformanceAPI();
  const origin = browserPerformanceTimeOrigin();
  if (!performance?.getEntries || !origin) {
    // Gatekeeper if performance API not available
    return;
  }

  const { spanStreamingEnabled, ignoreResourceSpans } = options;

  const timeOrigin = msToSec(origin);

  const performanceEntries = performance.getEntries();

  const { attributes, start_timestamp: transactionStartTime } = spanToJSON(span);

  performanceEntries.slice(_performanceCursor).forEach(entry => {
    const startTime = msToSec(entry.startTime);
    const duration = msToSec(
      // Inexplicably, Chrome sometimes emits a negative duration. We need to work around this.
      // There is a SO post attempting to explain this, but it leaves one with open questions: https://stackoverflow.com/questions/23191918/peformance-getentries-and-negative-duration-display
      // The way we clamp the value is probably not accurate, since we have observed this happen for things that may take a while to load, like for example the replay worker.
      // TODO: Investigate why this happens and how to properly mitigate. For now, this is a workaround to prevent transactions being dropped due to negative duration spans.
      Math.max(0, entry.duration),
    );

    if (
      attributes[SENTRY_OP] === 'navigation' &&
      transactionStartTime &&
      timeOrigin + startTime < transactionStartTime
    ) {
      return;
    }

    switch (entry.entryType) {
      case 'navigation': {
        _addNavigationSpans(span, entry as PerformanceNavigationTiming, timeOrigin);
        break;
      }
      case 'paint': {
        _addPaintSpan(span, entry, startTime, duration, timeOrigin);
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

  _trackNavigator(span, spanStreamingEnabled);
}

/** Create a span for a browser paint performance entry. */
function _addPaintSpan(
  span: Span,
  entry: PerformanceEntry,
  startTime: number,
  duration: number,
  timeOrigin: number,
): void {
  const startTimestamp = timeOrigin + startTime;

  startAndEndSpan(span, startTimestamp, startTimestamp + duration, {
    name: entry.name,
    attributes: {
      [SENTRY_OP]: BROWSER_BROWSER_PAINT_SPAN_OP,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
    },
  });
}

/**
 * Instrument navigation entries
 * exported only for tests
 */
export function _addNavigationSpans(span: Span, entry: PerformanceNavigationTiming, timeOrigin: number): void {
  _addPerformanceNavigationTiming(span, entry, 'unloadEvent', timeOrigin, 'unload_event');
  _addPerformanceNavigationTiming(span, entry, 'redirect', timeOrigin, 'redirect');
  _addPerformanceNavigationTiming(span, entry, 'domContentLoadedEvent', timeOrigin, 'dom_content_loaded_event');
  _addPerformanceNavigationTiming(span, entry, 'loadEvent', timeOrigin, 'load_event');
  _addPerformanceNavigationTiming(span, entry, 'connect', timeOrigin, 'connect');
  _addPerformanceNavigationTiming(span, entry, 'secureConnection', timeOrigin, 'tls_ssl');
  _addPerformanceNavigationTiming(span, entry, 'fetch', timeOrigin, 'cache');
  _addPerformanceNavigationTiming(span, entry, 'domainLookup', timeOrigin, 'dns');

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

  attributes[URL_FULL] = filterCollectedUrl(resourceUrl);

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
 * TODO v11: Remove non-span-streaming attributes and measurements once we removed transactions
 */
function _trackNavigator(span: Span, spanStreamingEnabled: boolean | undefined): void {
  const navigator = WINDOW.navigator as null | (Navigator & NavigatorNetworkInformation & NavigatorDeviceMemory);
  if (!navigator) {
    return;
  }

  // track network connectivity
  const connection = navigator.connection;
  if (connection) {
    if (connection.effectiveType) {
      span.setAttribute(
        spanStreamingEnabled ? 'network.connection.effective_type' : 'effectiveConnectionType',
        connection.effectiveType,
      );
    }

    if (connection.type) {
      span.setAttribute(spanStreamingEnabled ? 'network.connection.type' : 'connectionType', connection.type);
    }

    if (isMeasurementValue(connection.rtt)) {
      if (spanStreamingEnabled) {
        span.setAttribute('network.connection.rtt', connection.rtt);
      } else if (spanToJSON(span).attributes[SENTRY_OP] === 'pageload') {
        // Measurements are only recorded on the pageload span, matching the historical
        // behavior where `connection.rtt` was only flushed for pageload transactions.
        setMeasurement('connection.rtt', connection.rtt, 'millisecond');
      }
    }
  }

  if (isMeasurementValue(navigator.deviceMemory)) {
    if (spanStreamingEnabled) {
      span.setAttribute('device.memory.estimated_capacity', navigator.deviceMemory);
    } else {
      span.setAttribute('deviceMemory', `${navigator.deviceMemory} GB`);
    }
  }

  if (isMeasurementValue(navigator.hardwareConcurrency)) {
    if (spanStreamingEnabled) {
      span.setAttribute('device.processor_count', navigator.hardwareConcurrency);
    } else {
      span.setAttribute('hardwareConcurrency', String(navigator.hardwareConcurrency));
    }
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
