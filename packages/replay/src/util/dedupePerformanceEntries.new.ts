import type { PerformanceNavigationTiming, PerformancePaintTiming } from '../types';

const NAVIGATION_ENTRY_KEYS: Array<keyof PerformanceNavigationTiming> = [
  'name',
  'type',
  'startTime',
  'transferSize',
  'duration',
];

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
function dedupePerformanceEntries(
  currentList: PerformanceEntryList,
  newList: PerformanceEntryList,
): PerformanceEntryList {
  if (!currentList.length && !newList.length) {
    return [];
  }

  // if (currentList.length === 0) {
  //   return newList.slice().sort((a, b) => a.startTime - b.startTime);
  // }

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
  let newLcpEntry: PerformancePaintTiming | undefined = existingLcpEntries[existingLcpEntries.length - 1]; // Take the last element as list is sorted
  let foundNewLcp = false;

  for (let i = newList.length - 1; i >= 0; i--) {
    const entry = newList[i];
    if (entry.entryType !== 'navigation' && entry.entryType !== 'largest-contentful-paint') {
      newEntries.push(entry);
      continue;
    }

    if (entry.entryType === 'navigation') {
      const navigationEntry = entry as PerformanceNavigationTiming;

      if (entry.duration <= 0) {
        // Ignore any navigation entries with duration 0, as they are likely duplicates
        continue;
      }

      // Check if the navigation entry is contained in currentList or newList
      if (
        // Ensure new entry does not already exist in existing entries
        !existingNavigationEntries.find(a => {
          return a === navigationEntry || NAVIGATION_ENTRY_KEYS.every(key => a[key] === navigationEntry[key]);
        }) &&
        // Ensure new entry does not already exist in new list of navigation entries
        !newNavigationEntries.find(a => {
          return a === navigationEntry || NAVIGATION_ENTRY_KEYS.every(key => a[key] === navigationEntry[key]);
        })
      ) {
        newNavigationEntries.push(navigationEntry);
      }

      // Otherwise this navigation entry is considered a duplicate and is thrown away
      continue;
    }

    if (entry.entryType === 'largest-contentful-paint' && !foundNewLcp) {
      // We want the latest LCP event only
      if (!newLcpEntry || newLcpEntry.startTime < entry.startTime) {
        newLcpEntry = entry;
        foundNewLcp = true;
      }
      continue;
    }
  }

  return newEntries
    .concat(newNavigationEntries, existingEntries, existingNavigationEntries, newLcpEntry ? [newLcpEntry] : [])
    .sort((a, b) => a.startTime - b.startTime);
}

exports.dedupePerformanceEntries = dedupePerformanceEntries;
