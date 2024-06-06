import {
  addClsInstrumentationHandler,
  addFidInstrumentationHandler,
  addInpInstrumentationHandler,
  addLcpInstrumentationHandler,
  addPerformanceInstrumentationHandler,
} from '@sentry-internal/browser-utils';
import type { AllPerformanceEntryData, ReplayContainer, ReplayPerformanceEntry } from '../types';
import type { Metric} from '../util/createPerformanceEntries';
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
    addLcpInstrumentationHandler(webVitalHandler(getLargestContentfulPaint)),
    addClsInstrumentationHandler(webVitalHandler(getCumulativeLayoutShift)),
    addFidInstrumentationHandler(webVitalHandler(getFirstInputDelay)),
    addInpInstrumentationHandler(webVitalHandler(getInteractionToNextPaint)),
  );

  // A callback to cleanup all handlers
  return () => {
    clearCallbacks.forEach(clearCallback => clearCallback());
  };

  function webVitalHandler(getter: (metric: Metric) => ReplayPerformanceEntry<AllPerformanceEntryData>): (data: { metric: Metric; }) => void {
    return ({metric}) => void replay.replayPerformanceEntries.push(getter(metric));
  }
}
