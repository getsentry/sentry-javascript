import { EventType } from '@sentry-internal/rrweb';

import type { AddEventResult, AllEntryData, ReplayContainer, ReplayPerformanceEntry } from '../types';

/**
 * Create a "span" for each performance entry.
 */
export function createPerformanceSpans(
  replay: ReplayContainer,
  entries: ReplayPerformanceEntry<AllEntryData>[],
): Promise<AddEventResult | null>[] {
  return entries.map(({ type, start, end, name, data }) => {
    const response = replay.throttledAddEvent({
      type: EventType.Custom,
      timestamp: start,
      data: {
        tag: 'performanceSpan',
        payload: {
          op: type,
          description: name,
          startTimestamp: start,
          endTimestamp: end,
          data,
        },
      },
    });

    // If response is a string, it means its either THROTTLED or SKIPPED
    return typeof response === 'string' ? Promise.resolve(null) : response;
  });
}
