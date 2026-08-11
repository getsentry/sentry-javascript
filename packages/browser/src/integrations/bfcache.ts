import {
  SENTRY_SEGMENT_NAME,
  BROWSER_BFCACHE_FRAME,
  BROWSER_BFCACHE_NOT_RESTORED_REASON_COUNT,
  BROWSER_BFCACHE_OUTCOME,
  BROWSER_BFCACHE_REASON,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { IntegrationFn, SpanAttributes } from '@sentry/core/browser';
import { debug, defineIntegration, getCurrentScope, metrics } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

const INTEGRATION_NAME = 'Bfcache';

type BFCacheOutcome = 'hit' | 'miss';

type BFCacheFrame = 'top' | 'child';

interface BFCacheIntegrationOptions {
  /**
   * Maximum number of not-restored reasons to emit per miss.
   *
   * By default every reason is reported. Set this to cap the number emitted per miss.
   * Values below 1 are clamped to 1.
   */
  maxReasons: number;
}

interface NotRestoredReason {
  reason?: string;
}

interface NotRestoredReasons {
  children?: NotRestoredReasons[] | null;
  reasons?: (NotRestoredReason | string)[] | null;
}

interface NavigationTimingWithNotRestoredReasons extends PerformanceNavigationTiming {
  notRestoredReasons?: NotRestoredReasons | null;
}

interface CollectedReason {
  reason: string;
  frame: BFCacheFrame;
}

/**
 * Captures bfcache hit/miss counters and Chromium notRestoredReasons when available.
 */
export const bfcacheIntegration = defineIntegration((options: Partial<BFCacheIntegrationOptions> = {}) => {
  const maxReasons = _resolveMaxReasons(options.maxReasons);

  return {
    name: INTEGRATION_NAME,

    setupOnce() {
      if (!WINDOW.addEventListener || !WINDOW.performance?.getEntriesByType) {
        DEBUG_BUILD && debug.log(`[${INTEGRATION_NAME}] Browser APIs unavailable, skipping instrumentation.`);
        return;
      }

      function onPageShow(event: PageTransitionEvent) {
        const routeName = _getSegmentName();
        if (event.persisted) {
          _captureBFCacheNavigation('hit', 0, routeName);
          return;
        }

        const navigationEntry = WINDOW.performance.getEntriesByType('navigation')[0] as
          | NavigationTimingWithNotRestoredReasons
          | undefined;

        if (navigationEntry?.type !== 'back_forward') {
          return;
        }

        const reasons = _collectNotRestoredReasons(navigationEntry.notRestoredReasons, maxReasons);
        _captureBFCacheNavigation('miss', reasons.length, routeName);

        // Measures how expensive the fallback reload was when a back/forward navigation missed bfcache.
        if (typeof navigationEntry.duration === 'number' && navigationEntry.duration > 0) {
          metrics.distribution('browser.bfcache.reload.duration', navigationEntry.duration, {
            unit: 'millisecond',
            attributes: _withOriginAttr({
              [SENTRY_SEGMENT_NAME]: routeName,
            }),
          });
        }

        reasons.forEach(r => _captureBFCacheReason(r, routeName));
      }

      // Listener should stay active because the event can trigger for an initial show before the bfcache entry coming into the second one.
      // This can be platform-dependent so we need to skip as many events till we get to the one containing the entry.
      // So we can't have { once } or a cleanup logic here, which is fine because `setupOnce` registers it a single time regardless of how many clients are created.
      WINDOW.addEventListener('pageshow', onPageShow, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures a bf navigation as a metric and records the outcome and reason count.
 */
function _captureBFCacheNavigation(outcome: BFCacheOutcome, reasonCount: number, routeName?: string): void {
  metrics.count('browser.bfcache.navigation', 1, {
    attributes: _withOriginAttr({
      [BROWSER_BFCACHE_OUTCOME]: outcome,
      // Attribute should be present if reasons are >= 1
      [BROWSER_BFCACHE_NOT_RESTORED_REASON_COUNT]: reasonCount || undefined,
      [SENTRY_SEGMENT_NAME]: routeName,
    }),
  });
}

/**
 * Maps a collected reason to a metric and captures/sends it.
 */
function _captureBFCacheReason({ reason, frame }: CollectedReason, routeName?: string) {
  metrics.count('browser.bfcache.not_restored', 1, {
    attributes: _withOriginAttr({
      [BROWSER_BFCACHE_REASON]: reason,
      [BROWSER_BFCACHE_FRAME]: frame,
      [SENTRY_SEGMENT_NAME]: routeName,
    }),
  });
}

/**
 * The segment name for a bfcache navigation, read from the scope rather than any span.
 *
 * A hit restore is silent to tracing (no pageload span), but the frozen scope still holds the last
 * transaction name a downstream SDK (Vue/React/etc.) set before the freeze, so we reuse that. On a miss the
 * page reloads with a fresh scope, so this is the new pageload name. Falls back to the raw pathname when unset.
 */
function _getSegmentName(): string | undefined {
  return getCurrentScope().getScopeData().transactionName || WINDOW.location?.pathname;
}

/**
 * Resolves the configured `maxReasons` cap. Reports every reason by default and clamps values below 1 to 1,
 * since a cap under 1 would silently drop all reasons.
 *
 * Exported for tests only.
 */
export function _resolveMaxReasons(maxReasons: number | undefined): number {
  if (maxReasons == null) {
    return Infinity;
  }

  if (maxReasons < 1) {
    DEBUG_BUILD &&
      debug.warn(`[${INTEGRATION_NAME}] \`maxReasons\` must be at least 1, got ${maxReasons}. Using 1 instead.`);
    return 1;
  }

  return maxReasons;
}

/**
 * Flattens the (possibly nested) bfcache `notRestoredReasons` tree into a capped list of reasons.
 *
 * Exported for tests only.
 */
export function _collectNotRestoredReasons(
  notRestoredReasons: NotRestoredReasons | null | undefined,
  maxReasons: number,
): CollectedReason[] {
  const reasons: CollectedReason[] = [];

  if (!notRestoredReasons || maxReasons <= 0) {
    return reasons;
  }

  _collectReasonsFromFrame(notRestoredReasons, 'top', reasons, maxReasons);

  return reasons;
}

function _collectReasonsFromFrame(
  frame: NotRestoredReasons,
  frameType: BFCacheFrame,
  collectedReasons: CollectedReason[],
  maxReasons: number,
): void {
  if (collectedReasons.length >= maxReasons) {
    return;
  }

  frame.reasons?.forEach(reason => {
    if (collectedReasons.length >= maxReasons) {
      return;
    }

    const reasonValue = typeof reason === 'string' ? reason : reason.reason;
    if (!reasonValue) {
      return;
    }

    collectedReasons.push({
      reason: reasonValue,
      frame: frameType,
    });
  });

  frame.children?.forEach(child => {
    _collectReasonsFromFrame(child, 'child', collectedReasons, maxReasons);
  });
}

/**
 * Adds the origin attributes to a set of attributes, it mutates the original attributes.
 */
function _withOriginAttr(attributes: SpanAttributes): SpanAttributes {
  attributes[SENTRY_ORIGIN] = 'auto.browser.bfcache';

  return attributes;
}
