import { browserPerformanceTimeOrigin } from '@sentry/utils';
import { record } from 'rrweb';

import { WINDOW } from './constants';
import type {
  AllPerformanceEntry,
  PerformanceNavigationTiming,
  PerformancePaintTiming,
  ReplayPerformanceEntry,
} from './types';

// Map entryType -> function to normalize data for event
// @ts-ignore TODO: entry type does not fit the create* functions entry type
const ENTRY_TYPES: Record<string, (entry: AllPerformanceEntry) => null | ReplayPerformanceEntry> = {
  // @ts-ignore TODO: entry type does not fit the create* functions entry type
  resource: createResourceEntry,
  paint: createPaintEntry,
  // @ts-ignore TODO: entry type does not fit the create* functions entry type
  navigation: createNavigationEntry,
  // @ts-ignore TODO: entry type does not fit the create* functions entry type
  'largest-contentful-paint': createLargestContentfulPaint,
};

/**
 * Create replay performance entries from the browser performance entries.
 */
export function createPerformanceEntries(entries: AllPerformanceEntry[]): ReplayPerformanceEntry[] {
  return entries.map(createPerformanceEntry).filter(Boolean) as ReplayPerformanceEntry[];
}

function createPerformanceEntry(entry: AllPerformanceEntry): ReplayPerformanceEntry | null {
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

function createPaintEntry(entry: PerformancePaintTiming): ReplayPerformanceEntry {
  const { duration, entryType, name, startTime } = entry;

  const start = getAbsoluteTime(startTime);
  return {
    type: entryType,
    name,
    start,
    end: start + duration,
  };
}

function createNavigationEntry(entry: PerformanceNavigationTiming): ReplayPerformanceEntry | null {
  // TODO: There looks to be some more interesting bits in here (domComplete, domContentLoaded)
  const { entryType, name, duration, domComplete, startTime, transferSize, type } = entry;

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
      duration,
    },
  };
}

function createResourceEntry(entry: PerformanceResourceTiming): ReplayPerformanceEntry | null {
  const { entryType, initiatorType, name, responseEnd, startTime, encodedBodySize, transferSize } = entry;

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
      encodedBodySize,
    },
  };
}

function createLargestContentfulPaint(
  entry: PerformanceEntry & { size: number; element: Node },
): ReplayPerformanceEntry {
  const { duration, entryType, startTime, size } = entry;

  const start = getAbsoluteTime(startTime);

  return {
    type: entryType,
    name: entryType,
    start,
    end: start + duration,
    data: {
      duration,
      size,
      // Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeId: record.mirror.getId(entry.element as any),
    },
  };
}
