import { WINDOW } from '../constants';
import type { ReplayContainer, ReplayPerformanceEntry } from '../types';
import { createPerformanceSpans } from './createPerformanceSpans';

type ReplayMemoryEntry = ReplayPerformanceEntry & { data: { memory: MemoryInfo } };

interface MemoryInfo {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

/**
 * Create a "span" for the total amount of memory being used by JS objects
 * (including v8 internal objects).
 */
export function addMemoryEntry(replay: ReplayContainer): void {
  // window.performance.memory is a non-standard API and doesn't work on all browsers, so we try-catch this
  try {
    createPerformanceSpans(replay, [
      // @ts-ignore memory doesn't exist on type Performance as the API is non-standard (we check that it exists above)
      createMemoryEntry(WINDOW.performance.memory),
    ]);
  } catch (error) {
    // Do nothing
  }
}

function createMemoryEntry(memoryEntry: MemoryInfo): ReplayMemoryEntry {
  const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = memoryEntry;
  // we don't want to use `getAbsoluteTime` because it adds the event time to the
  // time origin, so we get the current timestamp instead
  const time = new Date().getTime() / 1000;
  return {
    type: 'memory',
    name: 'memory',
    start: time,
    end: time,
    data: {
      memory: {
        jsHeapSizeLimit,
        totalJSHeapSize,
        usedJSHeapSize,
      },
    },
  };
}
