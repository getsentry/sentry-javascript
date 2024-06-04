import {
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
  addInpInstrumentationHandler,
} from '@sentry-internal/browser-utils';
import {  } from '@sentry-internal/browser-utils/build/types/metrics/instrument';
import type { ReplayContainer } from '../types';
import {
  getCumulativeLayoutShift,
  getFirstInputDelay,
  getInteractionToNextPaint,
  getLargestContentfulPaint,
} from '../util/createPerformanceEntries';

/**
 * Sets up a PerformanceObserver to listen to all performance entry types.
 * Returns a callback to stop observing.
 */
export function setupPerformanceObserver(replay: ReplayContainer): () => void {
  function addPerformanceEntry(entry: PerformanceEntry): void {
    // It is possible for entries to come up multiple times
    if (!replay.performanceEntries.includes(entry)) {
      replay.performanceEntries.push(entry);
    }
  }

  function onEntries({ entries }: { entries: PerformanceEntry[] }): void {
    entries.forEach(addPerformanceEntry);
  }

  const clearCallbacks: (() => void)[] = [];

  (['navigation', 'paint', 'resource'] as const).forEach(type => {
    clearCallbacks.push(addPerformanceInstrumentationHandler(type, onEntries));
  });

  clearCallbacks.push(
    addLcpInstrumentationHandler(({ metric }) => {
      replay.replayPerformanceEntries.push(getLargestContentfulPaint(metric));
    }),
    addClsInstrumentationHandler(({ metric }) => {
      replay.replayPerformanceEntries.push(getCumulativeLayoutShift(metric));
    }),
    addFidInstrumentationHandler(({ metric }) => {
      replay.replayPerformanceEntries.push(getFirstInputDelay(metric));
    }),
    addInpInstrumentationHandler(({ metric }) => {
      replay.replayPerformanceEntries.push(getInteractionToNextPaint(metric));
    }),
  );

  // A callback to cleanup all handlers
  return () => {
    clearCallbacks.forEach(clearCallback => clearCallback());
  };
}
