function nbDuplicatesToSkip(queue: PerformanceEntry[], curr: PerformanceEntry, startAt: number): number {
  let i = startAt;
  let nextNode: PerformanceEntry = queue[i];
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
    nextNode = queue[++i];
  }

  return i - startAt;
}

enum Queue {
  CURRENT = 0,
  PREVIOUS = 1,
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
  if (!list.length && !previousList.length) {
    return [];
  }

  let i = 0;
  let n = 0;

  // Helper to advance queue
  function advanceQueue(queue: Queue): void {
    if (queue === Queue.CURRENT) {
      i++;
    } else {
      n++;
    }
  }

  // Initialize deduped list and lcp entry index.
  // We keep track of the lcp entry index so that we can replace it if we find a later entry.
  const deduped: PerformanceEntryList = [];
  let lcpEntryIndex: number | undefined;

  while (i < list.length || n < previousList.length) {
    const current = list[i];
    const previous = previousList[n];

    // If nothing in queue A, take from bueue B,
    // if nothing in queue B, take from queue A.
    // If both queues have entries, take the earliest one.
    const queueType = !previous
      ? Queue.CURRENT
      : !current
      ? Queue.PREVIOUS
      : list[i].startTime <= previousList[n].startTime
      ? Queue.CURRENT
      : Queue.PREVIOUS;

    const entry = queueType === Queue.CURRENT ? list[i] : previousList[n];

    // Assign latest lcp entry if it later than current latest entry
    // If we do not have one yet, add it to the list and store it's index
    if (entry.entryType === 'largest-contentful-paint') {
      if (lcpEntryIndex === undefined || entry.startTime > deduped[lcpEntryIndex].startTime) {
        if (lcpEntryIndex === undefined) {
          deduped.push(entry);
          lcpEntryIndex = deduped.length - 1;
        } else {
          deduped[lcpEntryIndex] = entry;
        }
      }
      advanceQueue(queueType);
      continue;
    }

    if (entry.entryType === 'navigation') {
      // By default, any entry is considered new and we peek ahead to see how many duplicates there are.
      // We can rely on the peek behavior as the spec states that entries are sorted by startTime. As we peek,
      // we keep a count of how many duplicates we see and skip over them.
      const currentDuplicates = nbDuplicatesToSkip(list, entry, i);
      const previousDuplicates = nbDuplicatesToSkip(previousList, entry, n);

      // Jump to next entry after the duplicates - if there are none, advance the queue
      i += currentDuplicates ? currentDuplicates : 0;
      n += previousDuplicates ? previousDuplicates : 0;

      if (entry.duration <= 0) {
        advanceQueue(queueType);
        continue;
      }

      deduped.push(entry);
      continue;
    }

    deduped.push(entry);
    advanceQueue(queueType);
  }

  return deduped;
}
