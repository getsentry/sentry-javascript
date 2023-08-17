/**
 * Deduplicates performance entries list - assumes a sorted list as input as per
 * the spec https://w3c.github.io/performance-timeline/#dom-performance-getentries.
 *
 *
 * Deduplication is performed because we have observed duplicate navigation entries in real world data:
 * Some of the duplicates include:
 * - entries where duration = 0
 * - same reference entries
 * - none of the above
 * @param list {PerformanceEntryList}
 * @returns PerformanceEntryList
 */
export function dedupePerformanceEntries(list: PerformanceEntryList): PerformanceEntryList {
  const deduped: PerformanceEntryList = [];
  let lcpEntry: PerformancePaintTiming | undefined;

  let i = 0;
  while (i < list.length) {
    const entry = list[i];
    // Assign latest lcp entry if it is the latest entry
    // or if we dont currently have an lcp entry
    if (entry.entryType === 'largest-contentful-paint' && (!lcpEntry || entry.startTime > lcpEntry.startTime)) {
      lcpEntry = entry;
      i++;
      continue;
    }

    if (entry.entryType === 'navigation') {
      if (entry.duration <= 0) {
        i++;
        continue;
      }

      // By default, any entry is considered new and we peek ahead to see how many duplicates there are.
      // We can rely on the peek behavior as the spec states that entries are sorted by startTime. As we peek,
      // we keep a count of how many duplicates we see and skip over them.
      let skipCount = 0;
      let next: PerformanceEntry = list[i + skipCount + 1];
      while (
        next &&
        // Cheap reference check first, then compare keys. Since entries are sorted by startTime, compare that first.
        (next === entry ||
          (next.startTime === entry.startTime &&
            next.duration === entry.duration &&
            next.name === entry.name &&
            next.entryType === entry.entryType &&
            (next as PerformanceResourceTiming).transferSize === (entry as PerformanceResourceTiming).transferSize))
      ) {
        skipCount++;
        next = list[i + skipCount + 1];
      }

      // Jump to next entry after the duplicates
      i = i + 1 + skipCount;
      deduped.push(entry);
      continue;
    }

    deduped.push(entry);
    i++;
  }

  if (lcpEntry) {
    deduped.push(lcpEntry);
  }
  return deduped;
}
