type EntryType =
  | 'element'
  | 'navigation'
  | 'resource'
  | 'mark'
  | 'measure'
  | 'paint'
  | 'longtask';

export interface ReplayPerformanceEntry {
  /**
   * One of these types https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/entryType
   */
  type: string;

  /**
   * A more specific description of the performance entry
   */
  name: string;

  /**
   * The start timestamp in seconds
   */
  start: number;

  /**
   * The end timestamp in seconds
   */
  end: number;

  /**
   * Additional unstructured data to be included
   */
  data?: Record<string, any>;
}

// Map entryType -> function to normalize data for event
const ENTRY_TYPES: Record<
  string,
  (entry: PerformanceEntry) => ReplayPerformanceEntry
> = {
  resource: createResourceEntry,
  paint: createPaintEntry,
  navigation: createNavigationEntry,
  ['largest-contentful-paint']: createLargestContentfulPaint,
};

export function createPerformanceEntries(entries: PerformanceEntry[]) {
  return entries.map(createPerformanceEntry).filter(Boolean);
}

function createPerformanceEntry(entry: PerformanceEntry) {
  if (ENTRY_TYPES[entry.entryType] === undefined) {
    return null;
  }

  return ENTRY_TYPES[entry.entryType](entry);
}

function getAbsoluteTime(time: number) {
  return (window.performance.timeOrigin + time) / 1000;
}

function createPaintEntry(entry: PerformancePaintTiming) {
  const { duration, entryType, name, startTime } = entry;

  const start = getAbsoluteTime(startTime);
  return {
    type: entryType,
    name,
    start,
    end: start + duration,
  };
}

function createNavigationEntry(entry: PerformanceNavigationTiming) {
  // TODO: There looks to be some more interesting bits in here (domComplete, domContentLoaded)

  const { entryType, name, domComplete, startTime, transferSize, type } = entry;

  return {
    type: `${entryType}.${type}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(domComplete),
    name,
    data: {
      size: transferSize,
    },
  };
}
function createResourceEntry(entry: PerformanceResourceTiming) {
  const {
    entryType,
    initiatorType,
    name,
    responseEnd,
    startTime,
    transferSize,
  } = entry;

  return {
    type: `${entryType}.${initiatorType}`,
    start: getAbsoluteTime(startTime),
    end: getAbsoluteTime(responseEnd),
    name,
    data: {
      size: transferSize,
    },
  };
}

function createLargestContentfulPaint(
  entry: PerformanceEntry & { size: number }
) {
  const { duration, entryType, startTime, size } = entry;

  const start = getAbsoluteTime(startTime);
  return {
    type: entryType,
    name: entryType,
    start,
    end: start + duration,
    data: {
      size,
    },
  };
}
