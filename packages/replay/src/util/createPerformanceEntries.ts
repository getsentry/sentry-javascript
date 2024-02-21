import { record } from '@sentry-internal/rrweb';
import { browserPerformanceTimeOrigin } from '@sentry/utils';

import { WINDOW } from '../constants';
import type {
  AllPerformanceEntry,
  AllPerformanceEntryData,
  ExperimentalPerformanceResourceTiming,
  LargestContentfulPaintData,
  NavigationData,
  PaintData,
  ReplayPerformanceEntry,
  ResourceData,
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

/**
 * Create replay performance entries from the browser performance entries.
 */
export function createPerformanceEntries(
  entries: AllPerformanceEntry[],
): ReplayPerformanceEntry<AllPerformanceEntryData>[] {
  return entries.map(createPerformanceEntry).filter(Boolean) as ReplayPerformanceEntry<AllPerformanceEntryData>[];
}

function createPerformanceEntry(entry: AllPerformanceEntry): ReplayPerformanceEntry<AllPerformanceEntryData> | null {
  if (!ENTRY_TYPES[entry.entryType]) {
    return null;
  }

  return ENTRY_TYPES[entry.entryType](entry);
}

function getAbsoluteTime(time: number): number {
  // browserPerformanceTimeOrigin can be undefined if `performance` or
  // `performance.now` doesn't exist, but this is already checked by this integration
  return ((browserPerformanceTimeOrigin || WINDOW.performance.timeOrigin) + time) / 1000;
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
 * Add a LCP event to the replay based on an LCP metric.
 */
export function getLargestContentfulPaint(metric: {
  value: number;
  entries: PerformanceEntry[];
}): ReplayPerformanceEntry<LargestContentfulPaintData> {
  const entries = metric.entries;
  const lastEntry = entries[entries.length - 1] as (PerformanceEntry & { element?: Element }) | undefined;
  const element = lastEntry ? lastEntry.element : undefined;

  const value = metric.value;

  const end = getAbsoluteTime(value);

  const data: ReplayPerformanceEntry<LargestContentfulPaintData> = {
    type: 'largest-contentful-paint',
    name: 'largest-contentful-paint',
    start: end,
    end,
    data: {
      value,
      size: value,
      nodeId: element ? record.mirror.getId(element) : undefined,
    },
  };

  return data;
}
