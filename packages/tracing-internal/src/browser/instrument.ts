import { getFunctionName, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { onCLS } from './web-vitals/getCLS';
import { onFID } from './web-vitals/getFID';
import { onLCP } from './web-vitals/getLCP';
import { observe } from './web-vitals/lib/observe';
import { onTTFB } from './web-vitals/onTTFB';

type InstrumentHandlerTypePerformanceObserver = 'longtask' | 'event' | 'navigation' | 'paint' | 'resource';

type InstrumentHandlerTypeMetric = 'cls' | 'lcp' | 'fid' | 'ttfb';

// We provide this here manually instead of relying on a global, as this is not available in non-browser environements
// And we do not want to expose such types
interface PerformanceEntry {
  readonly duration: number;
  readonly entryType: string;
  readonly name: string;
  readonly startTime: number;
  toJSON(): Record<string, unknown>;
}

interface Metric {
  /**
   * The name of the metric (in acronym form).
   */
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';

  /**
   * The current value of the metric.
   */
  value: number;

  /**
   * The rating as to whether the metric value is within the "good",
   * "needs improvement", or "poor" thresholds of the metric.
   */
  rating: 'good' | 'needs-improvement' | 'poor';

  /**
   * The delta between the current value and the last-reported value.
   * On the first report, `delta` and `value` will always be the same.
   */
  delta: number;

  /**
   * A unique ID representing this particular metric instance. This ID can
   * be used by an analytics tool to dedupe multiple values sent for the same
   * metric instance, or to group multiple deltas together and calculate a
   * total. It can also be used to differentiate multiple different metric
   * instances sent from the same page, which can happen if the page is
   * restored from the back/forward cache (in that case new metrics object
   * get created).
   */
  id: string;

  /**
   * Any performance entries relevant to the metric value calculation.
   * The array may also be empty if the metric value was not based on any
   * entries (e.g. a CLS value of 0 given no layout shifts).
   */
  entries: PerformanceEntry[];

  /**
   * The type of navigation
   *
   * Navigation Timing API (or `undefined` if the browser doesn't
   * support that API). For pages that are restored from the bfcache, this
   * value will be 'back-forward-cache'.
   */
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender';
}

type InstrumentHandlerType = InstrumentHandlerTypeMetric | InstrumentHandlerTypePerformanceObserver;

type StopListening = undefined | void | (() => void);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InstrumentHandlerCallback = (data: any) => void;

type CleanupHandlerCallback = () => void;

const handlers: { [key in InstrumentHandlerType]?: InstrumentHandlerCallback[] } = {};
const instrumented: { [key in InstrumentHandlerType]?: boolean } = {};

let _previousCls: Metric | undefined;
let _previousFid: Metric | undefined;
let _previousLcp: Metric | undefined;
let _previousTtfb: Metric | undefined;

/**
 * Add a callback that will be triggered when a CLS metric is available.
 * Returns a cleanup callback which can be called to remove the instrumentation handler.
 *
 * Pass `stopOnCallback = true` to stop listening for CLS when the cleanup callback is called.
 * This will lead to the CLS being finalized and frozen.
 */
export function addClsInstrumentationHandler(
  callback: (data: { metric: Metric }) => void,
  stopOnCallback = false,
): CleanupHandlerCallback {
  return addMetricObserver('cls', callback, instrumentCls, _previousCls, stopOnCallback);
}

/**
 * Add a callback that will be triggered when a LCP metric is available.
 * Returns a cleanup callback which can be called to remove the instrumentation handler.
 *
 * Pass `stopOnCallback = true` to stop listening for LCP when the cleanup callback is called.
 * This will lead to the LCP being finalized and frozen.
 */
export function addLcpInstrumentationHandler(
  callback: (data: { metric: Metric }) => void,
  stopOnCallback = false,
): CleanupHandlerCallback {
  return addMetricObserver('lcp', callback, instrumentLcp, _previousLcp, stopOnCallback);
}

/**
 * Add a callback that will be triggered when a FID metric is available.
 * Returns a cleanup callback which can be called to remove the instrumentation handler.
 */
export function addFidInstrumentationHandler(callback: (data: { metric: Metric }) => void): CleanupHandlerCallback {
  return addMetricObserver('fid', callback, instrumentFid, _previousFid);
}

/**
 * Add a callback that will be triggered when a FID metric is available.
 */
export function addTtfbInstrumentationHandler(callback: (data: { metric: Metric }) => void): CleanupHandlerCallback {
  return addMetricObserver('ttfb', callback, instrumentTtfb, _previousTtfb);
}

export function addPerformanceInstrumentationHandler(
  type: 'event',
  callback: (data: { entries: (PerformanceEntry & { target?: unknown | null })[] }) => void,
): CleanupHandlerCallback;
export function addPerformanceInstrumentationHandler(
  type: InstrumentHandlerTypePerformanceObserver,
  callback: (data: { entries: PerformanceEntry[] }) => void,
): CleanupHandlerCallback;

/**
 * Add a callback that will be triggered when a performance observer is triggered,
 * and receives the entries of the observer.
 * Returns a cleanup callback which can be called to remove the instrumentation handler.
 */
export function addPerformanceInstrumentationHandler(
  type: InstrumentHandlerTypePerformanceObserver,
  callback: (data: { entries: PerformanceEntry[] }) => void,
): CleanupHandlerCallback {
  addHandler(type, callback);

  if (!instrumented[type]) {
    instrumentPerformanceObserver(type);
    instrumented[type] = true;
  }

  return getCleanupCallback(type, callback);
}

/** Trigger all handlers of a given type. */
function triggerHandlers(type: InstrumentHandlerType, data: unknown): void {
  const typeHandlers = handlers[type];

  if (!typeHandlers || !typeHandlers.length) {
    return;
  }

  for (const handler of typeHandlers) {
    try {
      handler(data);
    } catch (e) {
      DEBUG_BUILD &&
        logger.error(
          `Error while triggering instrumentation handler.\nType: ${type}\nName: ${getFunctionName(handler)}\nError:`,
          e,
        );
    }
  }
}

function instrumentCls(): StopListening {
  return onCLS(metric => {
    triggerHandlers('cls', {
      metric,
    });
    _previousCls = metric;
  });
}

function instrumentFid(): void {
  return onFID(metric => {
    triggerHandlers('fid', {
      metric,
    });
    _previousFid = metric;
  });
}

function instrumentLcp(): StopListening {
  return onLCP(metric => {
    triggerHandlers('lcp', {
      metric,
    });
    _previousLcp = metric;
  });
}

function instrumentTtfb(): StopListening {
  return onTTFB(metric => {
    triggerHandlers('ttfb', {
      metric,
    });
    _previousTtfb = metric;
  });
}

function addMetricObserver(
  type: InstrumentHandlerTypeMetric,
  callback: InstrumentHandlerCallback,
  instrumentFn: () => StopListening,
  previousValue: Metric | undefined,
  stopOnCallback = false,
): CleanupHandlerCallback {
  addHandler(type, callback);

  let stopListening: StopListening | undefined;

  if (!instrumented[type]) {
    stopListening = instrumentFn();
    instrumented[type] = true;
  }

  if (previousValue) {
    callback({ metric: previousValue });
  }

  return getCleanupCallback(type, callback, stopOnCallback ? stopListening : undefined);
}

function instrumentPerformanceObserver(type: InstrumentHandlerTypePerformanceObserver): void {
  const options: PerformanceObserverInit = {};

  // Special per-type options we want to use
  if (type === 'event') {
    options.durationThreshold = 0;
  }

  observe(
    type,
    entries => {
      triggerHandlers(type, { entries });
    },
    options,
  );
}

function addHandler(type: InstrumentHandlerType, handler: InstrumentHandlerCallback): void {
  handlers[type] = handlers[type] || [];
  (handlers[type] as InstrumentHandlerCallback[]).push(handler);
}

// Get a callback which can be called to remove the instrumentation handler
function getCleanupCallback(
  type: InstrumentHandlerType,
  callback: InstrumentHandlerCallback,
  stopListening: StopListening,
): CleanupHandlerCallback {
  return () => {
    if (stopListening) {
      stopListening();
    }

    const typeHandlers = handlers[type];

    if (!typeHandlers) {
      return;
    }

    const index = typeHandlers.indexOf(callback);
    if (index !== -1) {
      typeHandlers.splice(index, 1);
    }
  };
}
