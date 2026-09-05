import { debug, getFunctionName } from '@sentry/core';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { DEBUG_BUILD } from '../debug-build';

type InstrumentHandlerTypePerformanceObserver =
  | 'longtask'
  | 'event'
  | 'navigation'
  | 'paint'
  | 'resource'
  | 'element'
  | 'soft-navigation'
  // fist-input is still needed for INP
  | 'first-input';

type InstrumentHandlerTypeMetric = 'cls' | 'lcp' | 'ttfb' | 'inp' | 'fcp';

// We provide this here manually instead of relying on a global, as this is not available in non-browser environements
// And we do not want to expose such types
interface PerformanceEntry {
  readonly duration: number;
  readonly entryType: string;
  readonly name: string;
  readonly startTime: number;
  toJSON(): Record<string, unknown>;
}
export interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  duration: number;
  cancelable?: boolean;
  target?: unknown | null;
  interactionId?: number;
}

/**
 * A `soft-navigation` entry, minted by the browser once a history change is followed by a
 * confirming paint. `interactionId` is the id of the `PerformanceEventTiming` entry for the
 * interaction that drove the navigation, which is how we join it back to a Sentry navigation span.
 */
export interface PerformanceSoftNavigation extends PerformanceEntry {
  readonly interactionId: number;
  readonly navigationId: number;
}

interface PerformanceScriptTiming extends PerformanceEntry {
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  invoker: string;
  invokerType: string;
}
export interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  scripts: PerformanceScriptTiming[];
}

// Locally-defined to match web-vitals' `Metric` shape without importing it: web-vitals' type
// entrypoint carries a `declare global` block that references DOM globals not present in every
// TypeScript lib version (e.g. `NavigationType`), which leaks into and breaks consumers on older
// TS. Keeping this local keeps web-vitals' global augmentations out of our published types.
/**
 * The navigation types web-vitals reports a metric for. Wider than the set the
 * `browser.navigation.type` attribute uses - see `toBrowserNavigationType`.
 */
export type MetricNavigationType =
  | 'navigate'
  | 'reload'
  | 'back-forward'
  | 'back-forward-cache'
  | 'prerender'
  | 'restore'
  | 'soft-navigation';

interface Metric {
  /**
   * The name of the metric (in acronym form).
   */
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';

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
   * The type of navigation.
   *
   * Navigation Timing API (or `undefined` if the browser doesn't
   * support that API). For pages that are restored from the bfcache, this
   * value will be 'back-forward-cache'.
   */
  navigationType: MetricNavigationType;

  /**
   * The id of the navigation the metric belongs to. For soft navigations this is the
   * `navigationId` of the `soft-navigation` entry, otherwise it's the id of the hard navigation.
   */
  navigationId: number;

  /**
   * For soft navigations, the `interactionId` of the interaction that triggered the navigation.
   */
  navigationInteractionId?: number;

  /**
   * The start time the metric value is relative to. Non-zero for soft navigations, where the
   * time origin is the triggering interaction rather than the start of the document.
   */
  navigationStartTime?: number;

  /**
   * The URL the metric was recorded for. Relevant for soft navigations, where a metric can be
   * reported long after the URL has moved on.
   */
  navigationURL?: string;
}

type InstrumentHandlerType = InstrumentHandlerTypeMetric | InstrumentHandlerTypePerformanceObserver;

type StopListening = undefined | void | (() => void);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InstrumentHandlerCallback = (data: any) => void;

type CleanupHandlerCallback = () => void;

const handlers: { [key in InstrumentHandlerType]?: InstrumentHandlerCallback[] } = {};
const instrumented: { [key in InstrumentHandlerType]?: boolean } = {};

let _previousCls: Metric | undefined;
let _previousLcp: Metric | undefined;
let _previousTtfb: Metric | undefined;
let _previousInp: Metric | undefined;
let _previousFcp: Metric | undefined;

let _reportSoftNavs = false;
let _reportBfcache = false;

/**
 * Opt the CLS, LCP and INP observers into reporting metrics for soft navigations.
 *
 * This also turns `reportAllChanges` off for CLS and LCP. web-vitals force-reports a metric when
 * the navigation it belongs to is over, so without the intermediate updates every value a handler
 * receives is already the final one for its navigation. That only holds because soft navigations
 * are limited to span streaming, where CLS and LCP are sent as their own spans - the static
 * lifecycle instead writes them onto the pageload span as it ends, which is what `reportAllChanges`
 * was originally added for (#11934, #12360).
 *
 * Each observer is instrumented lazily, on its first handler, and web-vitals takes its options at
 * that point only. So this has to be called before any of the `add*InstrumentationHandler`
 * functions, otherwise it won't take effect for observers that are already running.
 *
 * On browsers without the Soft Navigation API this is a no-op: web-vitals feature-detects the API
 * and keeps reporting hard-navigation metrics as usual.
 */
export function enableSoftNavigationReporting(): void {
  _reportSoftNavs = true;
}

/**
 * Opt the CLS, LCP and INP observers into reporting metrics for back/forward-cache restores.
 *
 * web-vitals re-reports each metric after a restore, tagged with a `back-forward-cache` navigation
 * type. A restore is a new page view measured against a document that was never reloaded, so the
 * values only mean anything if there is a fresh root span for them to belong to. Without one they
 * would attach to the span the page had before it was frozen, which is why this is off by default.
 *
 * Like `enableSoftNavigationReporting`, this only affects observers instrumented after it is
 * called.
 */
export function enableBfcacheReporting(): void {
  _reportBfcache = true;
}

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
 * Add a callback that will be triggered when a TTFD metric is available.
 */
export function addTtfbInstrumentationHandler(callback: (data: { metric: Metric }) => void): CleanupHandlerCallback {
  return addMetricObserver('ttfb', callback, instrumentTtfb, _previousTtfb);
}

/**
 * Add a callback that will be triggered when a FCP metric is available.
 */
export function addFcpInstrumentationHandler(callback: (data: { metric: Metric }) => void): CleanupHandlerCallback {
  return addMetricObserver('fcp', callback, instrumentFcp, _previousFcp);
}

export type InstrumentationHandlerCallback = (data: {
  metric: Omit<Metric, 'entries'> & {
    entries: PerformanceEventTiming[];
  };
}) => void;

/**
 * Add a callback that will be triggered when a INP metric is available.
 * Returns a cleanup callback which can be called to remove the instrumentation handler.
 */
export function addInpInstrumentationHandler(callback: InstrumentationHandlerCallback): CleanupHandlerCallback {
  return addMetricObserver('inp', callback, instrumentInp, _previousInp);
}

export function addPerformanceInstrumentationHandler(
  type: 'event',
  callback: (data: { entries: ((PerformanceEntry & { target?: unknown | null }) | PerformanceEventTiming)[] }) => void,
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

  if (!typeHandlers?.length) {
    return;
  }

  for (const handler of typeHandlers) {
    try {
      handler(data);
    } catch (e) {
      DEBUG_BUILD &&
        debug.error(
          `Error while triggering instrumentation handler.\nType: ${type}\nName: ${getFunctionName(handler)}\nError:`,
          e,
        );
    }
  }
}

/**
 * Wraps a metric callback so that metrics reported after a back/forward-cache restore are dropped
 * unless `enableBfcacheReporting` was called. See there for why they are off by default.
 */
function unlessBfcacheDisabled(callback: (metric: Metric) => void): (metric: Metric) => void {
  return metric => {
    if (!_reportBfcache && metric.navigationType === 'back-forward-cache') {
      return;
    }
    callback(metric);
  };
}

function instrumentCls(): StopListening {
  return onCLS(
    unlessBfcacheDisabled(metric => {
      triggerHandlers('cls', {
        metric,
      });
      _previousCls = metric;
    }),
    // We want the callback to be called whenever the CLS value updates.
    // By default, the callback is only called when the tab goes to the background.
    { reportAllChanges: !_reportSoftNavs && !_reportBfcache, reportSoftNavs: _reportSoftNavs },
  );
}

function instrumentLcp(): StopListening {
  return onLCP(
    unlessBfcacheDisabled(metric => {
      triggerHandlers('lcp', {
        metric,
      });
      _previousLcp = metric;
    }),
    // We want the callback to be called whenever the LCP value updates.
    // By default, the callback is only called when the tab goes to the background.
    { reportAllChanges: !_reportSoftNavs && !_reportBfcache, reportSoftNavs: _reportSoftNavs },
  );
}

function instrumentTtfb(): StopListening {
  return onTTFB(
    unlessBfcacheDisabled(metric => {
      triggerHandlers('ttfb', {
        metric,
      });
      _previousTtfb = metric;
    }),
  );
}

function instrumentFcp(): StopListening {
  return onFCP(
    unlessBfcacheDisabled(metric => {
      triggerHandlers('fcp', {
        metric,
      });
      _previousFcp = metric;
    }),
  );
}

function instrumentInp(): StopListening {
  return onINP(
    unlessBfcacheDisabled(metric => {
      triggerHandlers('inp', {
        metric,
      });
      _previousInp = metric;
    }),
    { reportSoftNavs: _reportSoftNavs },
  );
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
  const options: PerformanceObserverInit = { type, buffered: true };

  // Special per-type options we want to use
  if (type === 'event') {
    (options as PerformanceObserverInit & { durationThreshold?: number }).durationThreshold = 0;
  }

  try {
    if (PerformanceObserver.supportedEntryTypes.includes(type)) {
      const po = new PerformanceObserver(list => {
        // Delay by a microtask to work around a bug in Safari where the
        // callback is invoked synchronously rather than in a separate task.
        // See: https://github.com/GoogleChrome/web-vitals/issues/277
        void Promise.resolve().then(() => {
          triggerHandlers(type, { entries: list.getEntries() });
        });
      });
      po.observe(options);
    }
  } catch {
    // Unsupported entry type; nothing to observe.
  }
}

function addHandler(type: InstrumentHandlerType, handler: InstrumentHandlerCallback): void {
  handlers[type] = handlers[type] || [];
  handlers[type].push(handler);
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

/**
 * Check if a PerformanceEntry is a PerformanceEventTiming by checking for the `duration` property.
 */
export function isPerformanceEventTiming(entry: PerformanceEntry): entry is PerformanceEventTiming {
  return 'duration' in entry;
}
