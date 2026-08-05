import {
  addClsInstrumentationHandler,
  addInpInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
} from '@sentry/browser-utils';
import type { ReplayContainer } from '../types';
import {
  getCumulativeLayoutShift,
  getInteractionToNextPaint,
  getLargestContentfulPaint,
  rememberEntryTimeOrigin,
  webVitalHandler,
} from '../util/createPerformanceEntries';

/**
 * Sets up a PerformanceObserver to listen to all performance entry types.
 * Returns a callback to stop observing.
 */
export function setupPerformanceObserver(replay: ReplayContainer): () => void {
  function addPerformanceEntry(entry: PerformanceEntry): void {
    // It is possible for entries to come up multiple times
    if (!replay.performanceEntries.includes(entry)) {
      // Entries are converted to wall clock time on flush, which can be long after this point, so the time origin that
      // is currently in effect has to be captured now.
      rememberEntryTimeOrigin(entry);
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
    addLcpInstrumentationHandler(webVitalHandler(getLargestContentfulPaint, replay)),
    addClsInstrumentationHandler(webVitalHandler(getCumulativeLayoutShift, replay)),
    addInpInstrumentationHandler(webVitalHandler(getInteractionToNextPaint, replay)),
  );

  // A callback to cleanup all handlers
  return () => {
    clearCallbacks.forEach(clearCallback => clearCallback());
  };
}
