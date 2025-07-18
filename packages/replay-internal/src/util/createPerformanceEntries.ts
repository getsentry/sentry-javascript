import { browserPerformanceTimeOrigin } from '@sentry/core';
import { record } from '@sentry-internal/rrweb';
import { WINDOW } from '../constants';
import type {
  AllPerformanceEntry,
  AllPerformanceEntryData,
  ExperimentalPerformanceResourceTiming,
  NavigationData,
  PaintData,
  ReplayContainer,
  ReplayPerformanceEntry,
  ResourceData,
  WebVitalData,
} from '../types';

// Map entryType -> function to normalize data for event
const ENTRY_TYPES: Record<
  string,
  (entry: AllPerformanceEntry) => null | ReplayPerformanceEntry<AllPerformanceEntryData>
> = {
  // @ts-expect-error TODO: entry type does not fit the create* functions entry type
  resource: createResourceEntry,
  paint: createPaintEntry,
  // @ts-expect-error TODO: entry type does not fit the create* functions entry type
  navigation: createNavigationEntry,
};

export interface Metric {
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
   * Any performance entries relevant to the metric value calculation.
   * The array may also be empty if the metric value was not based on any
   * entries (e.g. a CLS value of 0 given no layout shifts).
   */
  entries: PerformanceEntry[] | LayoutShift[];
}

interface LayoutShift extends PerformanceEntry {
  value: number;
  sources: LayoutShiftAttribution[];
  hadRecentInput: boolean;
}

interface LayoutShiftAttribution {
  node?: Node;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

/**
 * Handler creater for web vitals
 */
export function webVitalHandler(
  getter: (metric: Metric) => ReplayPerformanceEntry<AllPerformanceEntryData>,
  replay: ReplayContainer,
): (data: { metric: Metric }) => void {
  return ({ metric }) => void replay.replayPerformanceEntries.push(getter(metric));
}

/**
 * Create replay performance entries from the browser performance entries.
 */
export function createPerformanceEntries(
  entries: AllPerformanceEntry[],
): ReplayPerformanceEntry<AllPerformanceEntryData>[] {
  return entries.map(createPerformanceEntry).filter(Boolean) as ReplayPerformanceEntry<AllPerformanceEntryData>[];
}

function createPerformanceEntry(entry: AllPerformanceEntry): ReplayPerformanceEntry<AllPerformanceEntryData> | null {
  const entryType = ENTRY_TYPES[entry.entryType];
  if (!entryType) {
    return null;
  }

  return entryType(entry);
}

function getAbsoluteTime(time: number): number {
  // browserPerformanceTimeOrigin can be undefined if `performance` or
  // `performance.now` doesn't exist, but this is already checked by this integration
  return ((browserPerformanceTimeOrigin() || WINDOW.performance.timeOrigin) + time) / 1000;
}

function createPaintEntry(entry: PerformancePaintTiming): ReplayPerformanceEntry<PaintData> {
  const { duration, entryType, name, startTime } = entry;

  const start = getAbsoluteTime(startTime);
  return {
    type: entryType,
    name,
    start,
    end: start + duration,
    data: undefined,
  };
}

function createNavigationEntry(entry: PerformanceNavigationTiming): ReplayPerformanceEntry<NavigationData> | null {
  const {
    entryType,
    name,
    decodedBodySize,
    duration,
    domComplete,
    encodedBodySize,
    domContentLoadedEventStart,
    domContentLoadedEventEnd,
    domInteractive,
    loadEventStart,
    loadEventEnd,
    redirectCount,
    startTime,
    transferSize,
    type,
  } = entry;

  // Ignore entries with no duration, they do not seem to be useful and cause dupes
  if (duration === 0) {
    return null;
  }

  return {
    type: `${entryType}.${type}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(domComplete),
    name,
    data: {
      size: transferSize,
      decodedBodySize,
      encodedBodySize,
      duration,
      domInteractive,
      domContentLoadedEventStart,
      domContentLoadedEventEnd,
      loadEventStart,
      loadEventEnd,
      domComplete,
      redirectCount,
    },
  };
}

function createResourceEntry(
  entry: ExperimentalPerformanceResourceTiming,
): ReplayPerformanceEntry<ResourceData> | null {
  const {
    entryType,
    initiatorType,
    name,
    responseEnd,
    startTime,
    decodedBodySize,
    encodedBodySize,
    responseStatus,
    transferSize,
  } = entry;

  // Core SDK handles these
  if (['fetch', 'xmlhttprequest'].includes(initiatorType)) {
    return null;
  }

  return {
    type: `${entryType}.${initiatorType}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(responseEnd),
    name,
    data: {
      size: transferSize,
      statusCode: responseStatus,
      decodedBodySize,
      encodedBodySize,
    },
  };
}

/**
 * Add a LCP event to the replay based on a LCP metric.
 */
export function getLargestContentfulPaint(metric: Metric): ReplayPerformanceEntry<WebVitalData> {
  const lastEntry = metric.entries[metric.entries.length - 1] as (PerformanceEntry & { element?: Node }) | undefined;
  const node = lastEntry?.element ? [lastEntry.element] : undefined;
  return getWebVital(metric, 'largest-contentful-paint', node);
}

function isLayoutShift(entry: PerformanceEntry): entry is LayoutShift {
  return (entry as LayoutShift).sources !== undefined;
}

/**
 * Add a CLS event to the replay based on a CLS metric.
 */
export function getCumulativeLayoutShift(metric: Metric): ReplayPerformanceEntry<WebVitalData> {
  const layoutShifts: WebVitalData['attributions'] = [];
  const nodes: Node[] = [];
  for (const entry of metric.entries) {
    if (isLayoutShift(entry)) {
      const nodeIds = [];
      for (const source of entry.sources) {
        if (source.node) {
          nodes.push(source.node);
          const nodeId = record.mirror.getId(source.node);
          if (nodeId) {
            nodeIds.push(nodeId);
          }
        }
      }
      layoutShifts.push({ value: entry.value, nodeIds: nodeIds.length ? nodeIds : undefined });
    }
  }

  return getWebVital(metric, 'cumulative-layout-shift', nodes, layoutShifts);
}

/**
 * Add an INP event to the replay based on an INP metric.
 */
export function getInteractionToNextPaint(metric: Metric): ReplayPerformanceEntry<WebVitalData> {
  const lastEntry = metric.entries[metric.entries.length - 1] as (PerformanceEntry & { target?: Node }) | undefined;
  const node = lastEntry?.target ? [lastEntry.target] : undefined;
  return getWebVital(metric, 'interaction-to-next-paint', node);
}

/**
 * Add an web vital event to the replay based on the web vital metric.
 */
function getWebVital(
  metric: Metric,
  name: string,
  nodes: Node[] | undefined,
  attributions?: WebVitalData['attributions'],
): ReplayPerformanceEntry<WebVitalData> {
  const value = metric.value;
  const rating = metric.rating;

  const end = getAbsoluteTime(value);

  return {
    type: 'web-vital',
    name,
    start: end,
    end,
    data: {
      value,
      size: value,
      rating,
      nodeIds: nodes ? nodes.map(node => record.mirror.getId(node)) : undefined,
      attributions,
    },
  };
}
