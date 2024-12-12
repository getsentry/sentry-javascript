import {
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addInpInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
} from '@sentry-internal/browser-utils';
import type { ReplayContainer } from '../types';
import {
  getCumulativeLayoutShift,
  getFirstInputDelay,
  getInteractionToNextPaint,
  getLargestContentfulPaint,
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
    addFidInstrumentationHandler(webVitalHandler(getFirstInputDelay, replay)),
    addInpInstrumentationHandler(webVitalHandler(getInteractionToNextPaint, replay)),
  );

  // A callback to cleanup all handlers
  return () => {
    clearCallbacks.forEach(clearCallback => clearCallback());
  };
}
