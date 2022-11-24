const NAVIGATION_ENTRY_KEYS: Array<keyof PerformanceNavigationTiming> = [
  'name',
  'type',
  'startTime',
  'transferSize',
  'duration',
];

function isNavigationEntryEqual(a: PerformanceNavigationTiming) {
  return function (b: PerformanceNavigationTiming) {
    return NAVIGATION_ENTRY_KEYS.every(key => a[key] === b[key]);
  };
}

/**
 * There are some difficulties diagnosing why there are duplicate navigation
 * entries. We've witnessed several intermittent results:
 * - duplicate entries have duration = 0
 * - duplicate entries are the same object reference
 * - none of the above
 *
 * Compare the values of several keys to determine if the entries are duplicates or not.
 */
// TODO (high-prio): Figure out wth is returned here
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function dedupePerformanceEntries(
  currentList: PerformanceEntryList,
  newList: PerformanceEntryList,
): PerformanceEntryList {
  // Partition `currentList` into 3 different lists based on entryType
  const [existingNavigationEntries, existingLcpEntries, existingEntries] = currentList.reduce(
    (acc: [PerformanceNavigationTiming[], PerformancePaintTiming[], PerformanceEntryList], entry) => {
      if (entry.entryType === 'navigation') {
        acc[0].push(entry as PerformanceNavigationTiming);
      } else if (entry.entryType === 'largest-contentful-paint') {
        acc[1].push(entry as PerformancePaintTiming);
      } else {
        acc[2].push(entry);
      }
      return acc;
    },
    [[], [], []],
  );

  const newEntries: PerformanceEntryList = [];
  const newNavigationEntries: PerformanceNavigationTiming[] = [];
  let newLcpEntry: PerformancePaintTiming | undefined = existingLcpEntries.length
    ? existingLcpEntries[existingLcpEntries.length - 1] // Take the last element as list is sorted
    : undefined;

  newList.forEach(entry => {
    if (entry.entryType === 'largest-contentful-paint') {
      // We want the latest LCP event only
      if (!newLcpEntry || newLcpEntry.startTime < entry.startTime) {
        newLcpEntry = entry;
      }
      return;
    }

    if (entry.entryType === 'navigation') {
      const navigationEntry = entry as PerformanceNavigationTiming;

      // Check if the navigation entry is contained in currentList or newList
      if (
        // Ignore any navigation entries with duration 0, as they are likely duplicates
        entry.duration > 0 &&
        // Ensure new entry does not already exist in existing entries
        !existingNavigationEntries.find(isNavigationEntryEqual(navigationEntry)) &&
        // Ensure new entry does not already exist in new list of navigation entries
        !newNavigationEntries.find(isNavigationEntryEqual(navigationEntry))
      ) {
        newNavigationEntries.push(navigationEntry);
      }

      // Otherwise this navigation entry is considered a duplicate and is thrown away
      return;
    }

    newEntries.push(entry);
  });

  // Re-combine and sort by startTime
  return [
    ...(newLcpEntry ? [newLcpEntry] : []),
    ...existingNavigationEntries,
    ...existingEntries,
    ...newEntries,
    ...newNavigationEntries,
  ].sort((a, b) => a.startTime - b.startTime);
}
