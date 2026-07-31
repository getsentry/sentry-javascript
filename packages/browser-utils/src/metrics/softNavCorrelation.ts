import type { Span } from '@sentry/core';
import { browserPerformanceTimeOrigin, debug, spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { msToSec } from './utils';
import type { ReportOpts } from './web-vitals/types';
import { observe } from './web-vitals/lib/observe';
import { getSoftNavigationEntry, softNavs } from './web-vitals/lib/softNavs';

/**
 * Best-effort correlation between Chrome Soft Navigation `navigationId`s and the Sentry
 * navigation spans they belong to.
 *
 * The navigation span is created synchronously on `pushState`/`popstate`, but the browser's
 * `soft-navigation` PerformanceEntry (which carries the `navigationId`) is emitted
 * asynchronously, after the confirming paint (~40ms later, sometimes more). So we cannot know
 * the `navigationId` at span-creation time.
 *
 * Instead we register each navigation span as it starts, then when the `soft-navigation` entry
 * arrives we match it back to the span by start time (the entry's `startTime` is pinned to the
 * navigation-start instant, within ~1-2ms) and remember the mapping so soft-nav web-vital spans
 * can look up their navigation span by `navigationId`.
 *
 * This is inherently partial: navigations that don't meet the soft-nav heuristic (programmatic
 * navs, non-painting navs) produce no entry and therefore no correlation. Consumers must treat
 * a missing navigation span as expected, not exceptional.
 */

// How close (in seconds) a soft-nav entry's start must be to a navigation span's start to be
// considered the same navigation. Measured drift is ~1-2ms; we allow generous slack for router
// and paint jitter while staying far below realistic inter-navigation spacing.
const MATCH_TOLERANCE_SEC = 0.1;

// Keep a small, bounded history. A page realistically only needs the most recent navigations to
// still be correlatable; older ones have long since flushed.
const MAX_TRACKED = 5;

interface TrackedNavigationSpan {
  span: Span;
  startTimestamp: number;
}

const _navigationSpans: TrackedNavigationSpan[] = [];
const _navigationIdToSpan = new Map<string, Span>();
let _observerStarted = false;

/**
 * Register a navigation span so it can later be correlated to a soft-nav `navigationId`.
 * No-op unless the Soft Navigation API is available and soft-nav reporting is enabled.
 */
export function registerNavigationSpan(span: Span, reportSoftNavs?: boolean): void {
  if (!softNavs({ reportSoftNavs })) {
    DEBUG_BUILD && debug.log(`[SoftNav] registerNavigationSpan skipped (soft navs not enabled/supported)`);
    return;
  }

  const startTimestamp = spanToJSON(span).start_timestamp;
  if (startTimestamp == null) {
    return;
  }

  DEBUG_BUILD && debug.log(`[SoftNav] Registered navigation span (startTimestamp=${startTimestamp})`);

  _navigationSpans.push({ span, startTimestamp });
  if (_navigationSpans.length > MAX_TRACKED) {
    _navigationSpans.shift();
  }

  _startObserver();
}

/**
 * Look up the navigation span a soft-nav `navigationId` belongs to, if we managed to correlate
 * one. Falls back to matching the buffered soft-navigation entry by start time in case the
 * observer hasn't fired yet for this entry.
 */
export function getNavigationSpanForNavigationId(navigationId: string | undefined): Span | undefined {
  if (!navigationId) {
    return undefined;
  }

  const known = _navigationIdToSpan.get(navigationId);
  if (known) {
    return known;
  }

  const entry = getSoftNavigationEntry(navigationId);
  if (entry) {
    return _matchEntryToNavigationSpan(entry.startTime, navigationId);
  }

  return undefined;
}

/** Exposed for tests. Resets all correlation state. */
export function _resetSoftNavCorrelation(): void {
  _navigationSpans.length = 0;
  _navigationIdToSpan.clear();
  _observerStarted = false;
}

function _startObserver(): void {
  if (_observerStarted) {
    return;
  }
  _observerStarted = true;

  DEBUG_BUILD && debug.log(`[SoftNav] Starting soft-navigation correlation observer`);

  // When a soft-navigation entry lands, correlate it to the navigation span it belongs to.
  const opts: ReportOpts = { reportSoftNavs: true };
  observe(
    'soft-navigation',
    entries => {
      DEBUG_BUILD && debug.log(`[SoftNav] soft-navigation observer fired with ${entries.length} entry/entries`);
      for (const entry of entries) {
        if (entry.navigationId) {
          _matchEntryToNavigationSpan(entry.startTime, entry.navigationId);
        }
      }
    },
    opts,
  );
}

/**
 * Match a soft-nav entry (by its start time, in ms relative to timeOrigin) to the closest
 * registered navigation span, stamp the `navigationId` onto that span, and cache the mapping.
 */
function _matchEntryToNavigationSpan(entryStartTimeMs: number, navigationId: string): Span | undefined {
  const timeOrigin = browserPerformanceTimeOrigin() || 0;
  const entryStartTimestamp = msToSec(timeOrigin + entryStartTimeMs);

  let best: TrackedNavigationSpan | undefined;
  let bestDiff = MATCH_TOLERANCE_SEC;
  for (const tracked of _navigationSpans) {
    const diff = Math.abs(tracked.startTimestamp - entryStartTimestamp);
    if (diff <= bestDiff) {
      bestDiff = diff;
      best = tracked;
    }
  }

  if (!best) {
    DEBUG_BUILD && debug.log(`[SoftNav] No navigation span matched navigationId ${navigationId}`);
    return undefined;
  }

  DEBUG_BUILD &&
    debug.log(`[SoftNav] Correlated navigationId ${navigationId} to navigation span (diff=${bestDiff}s)`);

  best.span.setAttribute('sentry.navigation_id', navigationId);
  _navigationIdToSpan.set(navigationId, best.span);
  if (_navigationIdToSpan.size > MAX_TRACKED) {
    const oldest = _navigationIdToSpan.keys().next().value;
    if (oldest !== undefined) {
      _navigationIdToSpan.delete(oldest);
    }
  }

  return best.span;
}
