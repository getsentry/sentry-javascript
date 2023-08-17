function skipDuplicates(queue: PerformanceEntry[], curr: PerformanceEntry, pos: number): number {
  let skipCount = 0;
  let nextNode: PerformanceEntry = queue[pos + skipCount + 1];
  while (
    nextNode &&
    // Cheap reference check first, then compare keys. Since entries are sorted by startTime, compare that first.
    (nextNode === curr ||
      (nextNode.startTime === curr.startTime &&
        nextNode.duration === curr.duration &&
        nextNode.name === curr.name &&
        nextNode.entryType === curr.entryType &&
        (nextNode as PerformanceResourceTiming).transferSize === (curr as PerformanceResourceTiming).transferSize))
  ) {
    skipCount++;
    nextNode = queue[pos + skipCount + 1];
  }
  return skipCount;
}
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
// eslint-disable-next-line complexity
export function dedupePerformanceEntries(
  list: PerformanceEntryList,
  previousList: PerformanceEntryList,
): PerformanceEntryList {
  let i = 0;
  let n = 0;

  if (!list.length && !previousList.length) {
    return [];
  }

  const next = (queue: string): void => {
    if (queue === 'current') {
      i++;
    } else {
      n++;
    }
  };

  const deduped: PerformanceEntryList = [];
  let lcpEntryIndex: number | undefined;

  while (i < list.length || n < previousList.length) {
    const current = list[i];
    const previous = previousList[n];

    const queueType = !previous
      ? 'current'
      : !current
      ? 'previous'
      : list[i].startTime <= previousList[n].startTime
      ? 'current'
      : 'previous';

    const entry = queueType === 'current' ? list[i] : previousList[n];

    // Assign latest lcp entry if it is the latest entry
    // or if we dont currently have an lcp entry.
    if (entry.entryType === 'largest-contentful-paint') {
      if (lcpEntryIndex === undefined || entry.startTime > deduped[lcpEntryIndex].startTime) {
        if (lcpEntryIndex === undefined) {
          deduped.push(entry);
          lcpEntryIndex = deduped.length - 1;
        } else {
          deduped[lcpEntryIndex] = entry;
        }
      }
      next(queueType);
      continue;
    }

    if (entry.entryType === 'navigation') {
      if (entry.duration <= 0) {
        next(queueType);
        continue;
      }

      // By default, any entry is considered new and we peek ahead to see how many duplicates there are.
      // We can rely on the peek behavior as the spec states that entries are sorted by startTime. As we peek,
      // we keep a count of how many duplicates we see and skip over them.
      const jumpToCurrent = skipDuplicates(list, entry, i);
      const jumpToPrevious = skipDuplicates(previousList, entry, n);

      // Jump to next entry after the duplicates
      i = jumpToCurrent ? jumpToCurrent + i + 1 : i + (queueType === 'current' ? 1 : 0);
      n = jumpToPrevious ? jumpToPrevious + n + 1 : n + (queueType === 'previous' ? 1 : 0);

      deduped.push(entry);
      continue;
    }

    deduped.push(entry);
    next(queueType);
  }

  return deduped;
}
