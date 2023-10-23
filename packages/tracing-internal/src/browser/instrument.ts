import { getFunctionName, logger } from '@sentry/utils';

import { onCLS } from './web-vitals/getCLS';
import { onFID } from './web-vitals/getFID';
import { onLCP } from './web-vitals/getLCP';
import { observe } from './web-vitals/lib/observe';

type InstrumentHandlerTypePerformanceObserver = 'longtask' | 'event' | 'navigation' | 'paint' | 'resource';

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

export type InstrumentHandlerType = 'cls' | 'lcp' | 'fid' | InstrumentHandlerTypePerformanceObserver;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InstrumentHandlerCallback = (data: any) => void;

type CleanupHandlerCallback = () => void;

const handlers: { [key in InstrumentHandlerType]?: InstrumentHandlerCallback[] } = {};
const instrumented: { [key in InstrumentHandlerType]?: boolean } = {};

/** Instruments given API */
function instrument(type: InstrumentHandlerType): void {
  if (instrumented[type]) {
    return;
  }

  instrumented[type] = true;

  switch (type) {
    case 'cls':
      instrumentCls();
      break;
    case 'fid':
      instrumentFid();
      break;
    case 'lcp':
      instrumentLcp();
      break;
    case 'longtask':
    case 'event':
    case 'navigation':
    case 'paint':
    case 'resource':
      instrumentPerformanceObserver(type);
      break;
    default:
      __DEBUG_BUILD__ && logger.warn('unknown instrumentation type:', type);
      return;
  }
}

export function addPerformanceInstrumentationHandler(
  type: 'event',
  callback: (data: { entries: (PerformanceEntry & { target?: unknown | null })[] }) => void,
): CleanupHandlerCallback;
export function addPerformanceInstrumentationHandler(
  type: InstrumentHandlerTypePerformanceObserver,
  callback: (data: { entries: PerformanceEntry[] }) => void,
): CleanupHandlerCallback;
export function addPerformanceInstrumentationHandler(
  type: 'lcp' | 'cls' | 'fid',
  callback: (data: { metric: Metric }) => void,
): CleanupHandlerCallback;

/**
 * Add handler that will be called when given type of instrumentation triggers.
 * Use at your own risk, this might break without changelog notice, only used internally.
 * @hidden
 */
export function addPerformanceInstrumentationHandler(
  type: InstrumentHandlerType,
  callback: InstrumentHandlerCallback,
): CleanupHandlerCallback {
  handlers[type] = handlers[type] || [];
  (handlers[type] as InstrumentHandlerCallback[]).push(callback);
  instrument(type);

  // Metrics may have been sent before, in which case we still want to trigger callbacks
  if (type === 'cls' && _previousCls) {
    callback({ metric: _previousCls });
  }
  if (type === 'fid' && _previousFid) {
    callback({ metric: _previousFid });
  }
  if (type === 'lcp' && _previousLcp) {
    callback({ metric: _previousLcp });
  }

  // Return a function to remove the handler
  return () => {
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
      __DEBUG_BUILD__ &&
        logger.error(
          `Error while triggering instrumentation handler.\nType: ${type}\nName: ${getFunctionName(handler)}\nError:`,
          e,
        );
    }
  }
}

let _previousCls: Metric | undefined;
let _previousFid: Metric | undefined;
let _previousLcp: Metric | undefined;

function instrumentCls(): void {
  onCLS(metric => {
    triggerHandlers('cls', { metric });
    _previousCls = metric;
  });
}

function instrumentFid(): void {
  onFID(metric => {
    triggerHandlers('fid', {
      metric,
    });
    _previousFid = metric;
  });
}

function instrumentLcp(): void {
  onLCP(metric => {
    triggerHandlers('lcp', {
      metric,
    });
    _previousLcp = metric;
  });
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
