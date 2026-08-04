import { SENTRY_SEGMENT_NAME } from '@sentry/conventions/attributes';
import type { IntegrationFn } from '@sentry/core/browser';
import { debug, defineIntegration, getCurrentScope, metrics } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

const INTEGRATION_NAME = 'BFCacheMetrics';

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
export const bfcacheMetricsIntegration = defineIntegration((options: Partial<BFCacheIntegrationOptions> = {}) => {
  const maxReasons = _resolveMaxReasons(options.maxReasons);

  return {
    name: INTEGRATION_NAME,

    setup() {
      if (!WINDOW.addEventListener || !WINDOW.performance?.getEntriesByType) {
        DEBUG_BUILD && debug.log('[BFCache] Browser APIs unavailable, skipping instrumentation.');
        return;
      }

      function onPageShow(event: PageTransitionEvent) {
        const transactionName = _getTransactionName();
        if (event.persisted) {
          _captureBFCacheNavigation('hit', undefined, transactionName);
          return;
        }

        const navigationEntry = WINDOW.performance.getEntriesByType('navigation')[0] as
          | NavigationTimingWithNotRestoredReasons
          | undefined;

        if (navigationEntry?.type !== 'back_forward') {
          return;
        }

        const reasons = _collectNotRestoredReasons(navigationEntry.notRestoredReasons, maxReasons);
        _captureBFCacheNavigation('miss', reasons.length, transactionName);

        // Measures how expensive the fallback reload was when a back/forward navigation missed bfcache.
        if (typeof navigationEntry.duration === 'number' && navigationEntry.duration > 0) {
          metrics.distribution('browser.bfcache.reload.duration', navigationEntry.duration, {
            unit: 'millisecond',
            attributes: {
              [SENTRY_SEGMENT_NAME]: transactionName,
            },
          });
        }

        reasons.forEach(r => _captureBFCacheReason(r, transactionName));
      }

      // Listener should stay active because the event can trigger for an initial show before the bfcache entry coming into the second one.
      // This can be platform-dependent so we need to skip as many events till we get to the one containing the entry.
      // So we can't have { once } or a cleanup logic here, which is fine because this is setup only once.
      WINDOW.addEventListener('pageshow', onPageShow, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures a bf navigation as a metric and records the outcome and reason count.
 */
function _captureBFCacheNavigation(outcome: BFCacheOutcome, reasonCount?: number, transactionName?: string): void {
  metrics.count('browser.bfcache.navigation', 1, {
    attributes: {
      // TODO: use convention constants
      'browser.bfcache.outcome': outcome,
      'browser.bfcache.not_restored_reason_count': reasonCount,
      [SENTRY_SEGMENT_NAME]: transactionName,
    },
  });
}

/**
 * Maps a collected reason to a metric and captures/sends it.
 */
function _captureBFCacheReason({ reason, frame }: CollectedReason, transactionName?: string) {
  metrics.count('browser.bfcache.not_restored', 1, {
    attributes: {
      // TODO: use convention constants
      'browser.bfcache.reason': reason,
      'browser.bfcache.frame': frame,
      [SENTRY_SEGMENT_NAME]: transactionName,
    },
  });
}

function _getTransactionName(): string | undefined {
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
    DEBUG_BUILD && debug.warn(`[BFCache] \`maxReasons\` must be at least 1, got ${maxReasons}. Using 1 instead.`);
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
