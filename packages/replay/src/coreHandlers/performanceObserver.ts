import type { ReplayContainer } from '../types';
import { dedupePerformanceEntries } from '../util/dedupePerformanceEntries';

/**
 * Sets up a PerformanceObserver to listen to all performance entry types.
 */
export function setupPerformanceObserver(replay: ReplayContainer): PerformanceObserver {
  const performanceObserverHandler = (list: PerformanceObserverEntryList): void => {
    // For whatever reason the observer was returning duplicate navigation
    // entries (the other entry types were not duplicated).
    replay.performanceEvents = dedupePerformanceEntries(list.getEntries(), replay.performanceEvents);
  };

  const performanceObserver = new PerformanceObserver(performanceObserverHandler);

  [
    'element',
    'event',
    'first-input',
    'largest-contentful-paint',
    'layout-shift',
    'longtask',
    'navigation',
    'paint',
    'resource',
  ].forEach(type => {
    try {
      performanceObserver.observe({
        type,
        buffered: true,
      });
    } catch {
      // This can throw if an entry type is not supported in the browser.
      // Ignore these errors.
    }
  });

  return performanceObserver;
}
