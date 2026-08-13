import type { Client, Span } from '@sentry/core';
import { debug, LRUMap, SEMANTIC_ATTRIBUTE_SENTRY_OP, spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { PerformanceSoftNavigation } from '../instrumentation/performanceObserver';
import { addPerformanceInstrumentationHandler, isPerformanceEventTiming } from '../instrumentation/performanceObserver';
import { WINDOW } from '../types';

/**
 * The browser's `navigationId` for the soft navigation a span belongs to. Set on the navigation
 * span itself as well as on the web vital spans reported for it, so both sides of the correlation
 * are visible in the product.
 */
export const SOFT_NAVIGATION_ID_ATTRIBUTE = 'browser.soft_navigation.id';

/**
 * A page only ever needs its most recent navigations to still be joinable: web vitals for a soft
 * navigation are finalized at the next soft navigation or on pagehide, never later than that.
 */
const MAX_TRACKED_NAVIGATIONS = 5;

/**
 * Tolerance when matching a DOM event's `timeStamp` against the `startTime` of its Event Timing
 * entry. Both are `DOMHighResTimeStamp`s from the same clock, so this only absorbs rounding.
 */
const INTERACTION_MATCH_TOLERANCE_MS = 5;

interface SoftNavMetric {
  navigationType: string;
  navigationId: number;
  navigationInteractionId?: number;
}

interface PendingNavigation {
  span: Span;
  interactionTimestamp: number;
}

// The navigation span whose triggering interaction we haven't identified yet.
let _pendingNavigation: PendingNavigation | undefined;
// The timestamp of the most recent trusted click/keydown, i.e. our best guess at the interaction
// that a history change happening right now was driven by.
let _lastInteractionTimestamp: number | undefined;

const _interactionIdToNavigationSpan = new LRUMap<number, Span>(MAX_TRACKED_NAVIGATIONS);
const _navigationIdToNavigationSpan = new LRUMap<number, Span>(MAX_TRACKED_NAVIGATIONS);

let _correlationStarted = false;

/**
 * Whether the browser can report web vitals for soft navigations.
 *
 * This mirrors web-vitals' own feature detection: passing `reportSoftNavs` on a browser that fails
 * this check is a no-op there, so it has to be a no-op here too.
 */
export function supportsSoftNavigations(): boolean {
  try {
    return (
      PerformanceObserver.supportedEntryTypes.includes('soft-navigation') &&
      // Older implementations exposed this as an attribute rather than a method. Only the method
      // form shipped unflagged, so it's what web-vitals gates on.
      typeof (
        WINDOW as {
          PerformanceSoftNavigation?: { prototype?: { getLargestInteractionContentfulPaint?: unknown } };
        }
      ).PerformanceSoftNavigation?.prototype?.getLargestInteractionContentfulPaint === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Start correlating the browser's soft navigations with the SDK's navigation spans.
 *
 * A navigation span is created synchronously on the history change, but the browser only mints the
 * `soft-navigation` entry (and with it the `navigationId` that web vitals are reported against)
 * once the navigation has been confirmed by a paint. So the `navigationId` cannot be known at span
 * creation time and the two have to be joined after the fact.
 *
 * The join key is the `interactionId` of the interaction that drove the navigation: per the Soft
 * Navigations spec the `soft-navigation` entry carries the `interactionId` of the interaction that
 * triggered it, which is the same id the interaction's own `PerformanceEventTiming` entry carries.
 * So we bind a navigation span to the interaction it happened during, and the soft navigation
 * joins back to that span through the shared id.
 *
 * This is inherently partial. Navigations that don't meet the browser's soft navigation heuristic
 * (programmatic navigations, navigations that never paint, back/forward from the browser chrome)
 * produce no entry at all, so those navigation spans simply have no web vitals.
 */
export function startSoftNavigationCorrelation(client: Client): void {
  if (_correlationStarted || !supportsSoftNavigations()) {
    return;
  }
  _correlationStarted = true;

  const onInteraction = (event: Event): void => {
    if (event.isTrusted) {
      _lastInteractionTimestamp = event.timeStamp;
    }
  };
  // Only click and keydown can start a soft navigation, which is also what the SDK's redirect
  // detection listens for.
  WINDOW.addEventListener('click', onInteraction, { capture: true, passive: true });
  WINDOW.addEventListener('keydown', onInteraction, { capture: true, passive: true });

  client.on('spanStart', span => {
    if (spanToJSON(span).attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] !== 'navigation') {
      return;
    }

    // A navigation with no preceding interaction can't produce a soft navigation, so there is
    // nothing to wait for. Dropping the pending span here also keeps us from binding a stale one.
    _pendingNavigation =
      _lastInteractionTimestamp != null ? { span, interactionTimestamp: _lastInteractionTimestamp } : undefined;
  });

  const bindInteractionToNavigationSpan = ({ entries }: { entries: PerformanceEntry[] }): void => {
    for (const entry of entries) {
      const pending = _pendingNavigation;
      if (!pending || !isPerformanceEventTiming(entry) || !entry.interactionId) {
        continue;
      }

      if (Math.abs(entry.startTime - pending.interactionTimestamp) > INTERACTION_MATCH_TOLERANCE_MS) {
        continue;
      }

      _interactionIdToNavigationSpan.set(entry.interactionId, pending.span);
      _pendingNavigation = undefined;
    }
  };

  // `durationThreshold: 0` is applied for `event` by the shared observer, which matters here:
  // interactions below the 104ms default would otherwise never surface an `interactionId`.
  addPerformanceInstrumentationHandler('event', bindInteractionToNavigationSpan);
  addPerformanceInstrumentationHandler('first-input', bindInteractionToNavigationSpan);

  addPerformanceInstrumentationHandler('soft-navigation', ({ entries }) => {
    for (const entry of entries as PerformanceSoftNavigation[]) {
      const span = _interactionIdToNavigationSpan.get(entry.interactionId);
      if (!span) {
        DEBUG_BUILD && debug.log(`[SoftNav] No navigation span found for soft navigation ${entry.navigationId}`, entry);
        continue;
      }

      _navigationIdToNavigationSpan.set(entry.navigationId, span);
      // Best effort: the soft navigation entry usually lands well within the navigation span's idle
      // window, but if the span has already been sent this attribute is dropped.
      span.setAttribute(SOFT_NAVIGATION_ID_ATTRIBUTE, entry.navigationId);
    }
  });
}

/**
 * The navigation span a soft navigation web vital belongs to, or `undefined` if the metric isn't
 * for a soft navigation or we failed to correlate it.
 */
export function getNavigationSpanForMetric(metric: SoftNavMetric): Span | undefined {
  if (metric.navigationType !== 'soft-navigation') {
    return undefined;
  }

  const span = _navigationIdToNavigationSpan.get(metric.navigationId);
  if (span) {
    return span;
  }

  // The `soft-navigation` observer may not have run for this navigation yet - entries from
  // different observers aren't delivered in a guaranteed order - so fall back to the join key the
  // metric carries itself.
  return metric.navigationInteractionId != null
    ? _interactionIdToNavigationSpan.get(metric.navigationInteractionId)
    : undefined;
}
