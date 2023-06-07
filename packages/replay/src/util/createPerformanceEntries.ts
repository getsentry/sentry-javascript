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
// @ts-ignore TODO: entry type does not fit the create* functions entry type
const ENTRY_TYPES: Record<
  string,
  (entry: AllPerformanceEntry) => null | ReplayPerformanceEntry<AllPerformanceEntryData>
> = {
  // @ts-ignore TODO: entry type does not fit the create* functions entry type
  resource: createResourceEntry,
  paint: createPaintEntry,
  // @ts-ignore TODO: entry type does not fit the create* functions entry type
  navigation: createNavigationEntry,
  // @ts-ignore TODO: entry type does not fit the create* functions entry type
  ['largest-contentful-paint']: createLargestContentfulPaint,
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
  if (ENTRY_TYPES[entry.entryType] === undefined) {
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

function createLargestContentfulPaint(
  entry: PerformanceEntry & { size: number; element: Node },
): ReplayPerformanceEntry<LargestContentfulPaintData> {
  const { entryType, startTime, size } = entry;

  let startTimeOrNavigationActivation = 0;

  if (WINDOW.performance) {
    const navEntry = WINDOW.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & {
      activationStart: number;
    };

    // See https://github.com/GoogleChrome/web-vitals/blob/9f11c4c6578fb4c5ee6fa4e32b9d1d756475f135/src/lib/getActivationStart.ts#L21
    startTimeOrNavigationActivation = (navEntry && navEntry.activationStart) || 0;
  }

  // value is in ms
  const value = Math.max(startTime - startTimeOrNavigationActivation, 0);
  // LCP doesn't have a "duration", it just happens at a single point in time.
  // But the UI expects both, so use end (in seconds) for both timestamps.
  const end = getAbsoluteTime(startTimeOrNavigationActivation) + value / 1000;

  return {
    type: entryType,
    name: entryType,
    start: end,
    end,
    data: {
      value, // LCP "duration" in ms
      size,
      // Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeId: record.mirror.getId(entry.element as any),
    },
  };
}
