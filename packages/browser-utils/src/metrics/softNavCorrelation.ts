import type { Span } from '@sentry/core';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../types';

// Minimal shapes of the browser performance entries we read. `interactionId` comes from the Event
// Timing spec; `navigationId` from the Soft Navigations spec. We type them locally so this module
// depends only on the browser, not on the web-vitals package.
interface EventTimingEntry extends PerformanceEntry {
  interactionId?: number;
}
interface SoftNavEntry extends PerformanceEntry {
  interactionId?: number;
  navigationId?: number;
}

/** Whether the Soft Navigation API is available and soft-nav reporting is enabled. */
function _softNavsEnabled(reportSoftNavs?: boolean): boolean {
  return !!reportSoftNavs && PerformanceObserver.supportedEntryTypes.includes('soft-navigation');
}

/** Look up a buffered soft-navigation entry by its navigationId. */
function _getSoftNavEntry(navigationId: number): SoftNavEntry | undefined {
  return (WINDOW.performance?.getEntriesByType('soft-navigation') as SoftNavEntry[] | undefined)?.find(
    entry => entry.navigationId === navigationId,
  );
}

/** Observe a performance entry type, swallowing unsupported-type errors. */
function _observe<T extends PerformanceEntry>(
  type: string,
  callback: (entries: T[]) => void,
  opts?: PerformanceObserverInit,
): void {
  try {
    if (PerformanceObserver.supportedEntryTypes.includes(type)) {
      const po = new PerformanceObserver(list => callback(list.getEntries() as T[]));
      po.observe({ type, buffered: true, ...opts });
    }
  } catch {
    // Unsupported entry type; nothing to observe.
  }
}

/**
 * Correlation between Chrome Soft Navigation `navigationId`s and the Sentry navigation spans they
 * belong to, keyed on the `interactionId` of the interaction that triggered the navigation.
 *
 * The navigation span is created synchronously on `pushState`/`popstate`, but the browser's
 * `soft-navigation` PerformanceEntry (which carries the `navigationId`) is emitted asynchronously,
 * after the confirming paint. So we cannot know the `navigationId` at span-creation time.
 *
 * Both sides converge on the same causality token: the `interactionId` assigned by the Event Timing
 * spec to the interaction that drove the navigation. The triggering interaction's
 * `PerformanceEventTiming` entry and the resulting `soft-navigation` entry carry the same
 * `interactionId`. We record navigation spans against the in-flight interaction, then join the
 * soft-nav entry to its span by `interactionId` when it arrives. This is deterministic, no
 * clock-window matching.
 *
 * This is inherently partial: navigations that don't meet the soft-nav heuristic (programmatic
 * navs, non-painting navs) produce no entry and therefore no correlation. Consumers must treat a
 * missing navigation span as expected, not exceptional.
 */

// Keep a small, bounded history. A page realistically only needs the most recent navigations to
// still be correlatable; older ones have long since flushed.
const MAX_TRACKED = 5;

// The most recent navigation span awaiting an `interactionId`. A navigation span is registered
// synchronously while the triggering interaction is still in flight, before its
// `PerformanceEventTiming` entry (and thus its `interactionId`) exists.
let _pendingNavigationSpan: Span | undefined;

// interactionId -> the navigation span that interaction triggered.
const _interactionIdToSpan = new Map<number, Span>();
// navigationId -> navigation span, resolved once a soft-nav entry joins the two.
const _navigationIdToSpan = new Map<number, Span>();

let _observersStarted = false;

/**
 * Register a navigation span so it can later be correlated to a soft-nav `navigationId`.
 * No-op unless the Soft Navigation API is available and soft-nav reporting is enabled.
 */
export function registerNavigationSpan(span: Span, reportSoftNavs?: boolean): void {
  if (!_softNavsEnabled(reportSoftNavs)) {
    return;
  }

  // The triggering interaction's `interactionId` is not available synchronously. Hold the span as
  // pending; the `event` observer attaches the `interactionId` once the interaction's entry lands.
  _pendingNavigationSpan = span;

  _startObservers();
}

/**
 * Look up the navigation span a soft-nav `navigationId` belongs to, if we managed to correlate one.
 */
export function getNavigationSpanForNavigationId(navigationId: number | undefined): Span | undefined {
  if (!navigationId) {
    return undefined;
  }

  const known = _navigationIdToSpan.get(navigationId);
  if (known) {
    return known;
  }

  // The soft-nav observer may not have fired yet for this entry; join it now via its interactionId.
  const entry = _getSoftNavEntry(navigationId);
  if (entry?.interactionId) {
    return _joinEntryToSpan(entry.interactionId, navigationId);
  }

  return undefined;
}

/** Exposed for tests. Resets all correlation state. */
export function _resetSoftNavCorrelation(): void {
  _pendingNavigationSpan = undefined;
  _interactionIdToSpan.clear();
  _navigationIdToSpan.clear();
  _observersStarted = false;
}

function _startObservers(): void {
  if (_observersStarted) {
    return;
  }
  _observersStarted = true;

  // Attach the in-flight interaction's `interactionId` to the pending navigation span. The event
  // that triggered the navigation and the soft-nav entry share this id, so it is our join key.
  // `durationThreshold: 0` is required so fast interactions (below the 104ms default) are still
  // observed, otherwise their `interactionId` never arrives and the join fails.
  const attachInteraction = (entries: EventTimingEntry[]): void => {
    for (const entry of entries) {
      if (entry.interactionId && _pendingNavigationSpan) {
        _rememberInteraction(entry.interactionId, _pendingNavigationSpan);
        _pendingNavigationSpan = undefined;
      }
    }
  };
  _observe<EventTimingEntry>('event', attachInteraction, { durationThreshold: 0 });
  _observe<EventTimingEntry>('first-input', attachInteraction);

  // When a soft-navigation entry lands, join it to the span its interaction triggered.
  _observe<SoftNavEntry>('soft-navigation', entries => {
    for (const entry of entries) {
      if (entry.interactionId && entry.navigationId) {
        _joinEntryToSpan(entry.interactionId, entry.navigationId);
      }
    }
  });
}

function _rememberInteraction(interactionId: number, span: Span): void {
  _interactionIdToSpan.set(interactionId, span);
  if (_interactionIdToSpan.size > MAX_TRACKED) {
    const oldest = _interactionIdToSpan.keys().next().value;
    if (oldest !== undefined) {
      _interactionIdToSpan.delete(oldest);
    }
  }
}

/**
 * Join a soft-nav entry to the navigation span its interaction triggered, stamp the `navigationId`
 * onto that span, and cache the mapping.
 */
function _joinEntryToSpan(interactionId: number, navigationId: number): Span | undefined {
  const span = _interactionIdToSpan.get(interactionId);
  if (!span) {
    DEBUG_BUILD && debug.log(`[SoftNav] No navigation span for interactionId ${interactionId} (navigationId ${navigationId})`);
    return undefined;
  }

  DEBUG_BUILD && debug.log(`[SoftNav] Correlated navigationId ${navigationId} to navigation span via interactionId ${interactionId}`);

  span.setAttribute('sentry.navigation_id', navigationId);
  _navigationIdToSpan.set(navigationId, span);
  if (_navigationIdToSpan.size > MAX_TRACKED) {
    const oldest = _navigationIdToSpan.keys().next().value;
    if (oldest !== undefined) {
      _navigationIdToSpan.delete(oldest);
    }
  }

  return span;
}
