import { SENTRY_SEGMENT_NAME } from '@sentry/conventions/attributes';
import type { IntegrationFn } from '@sentry/core/browser';
import { debug, defineIntegration, getCurrentScope, metrics } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

const INTEGRATION_NAME = 'BFCacheMetrics';

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

      WINDOW.addEventListener(
        'pageshow',
        event => {
          if (event.persisted) {
            _captureBFCacheNavigation('hit');
            return;
          }

          const navigationEntry = WINDOW.performance.getEntriesByType('navigation')[0] as
            | NavigationTimingWithNotRestoredReasons
            | undefined;

          if (navigationEntry?.type !== 'back_forward') {
            return;
          }

          const reasons = _collectNotRestoredReasons(navigationEntry.notRestoredReasons, maxReasons);

          _captureBFCacheNavigation('miss', reasons.length);

          // Measures how expensive the fallback reload was when a back/forward navigation missed bfcache.
          if (typeof navigationEntry.duration === 'number' && navigationEntry.duration > 0) {
            const transactionName = _getTransactionName();

            metrics.distribution('browser.bfcache.reload.duration', navigationEntry.duration, {
              unit: 'millisecond',
              attributes: {
                [SENTRY_SEGMENT_NAME]: transactionName,
              },
            });
          }

          reasons.forEach(({ reason, frame }) => {
            const transactionName = _getTransactionName();

            metrics.count('browser.bfcache.not_restored', 1, {
              attributes: {
                'browser.bfcache.reason': reason,
                'browser.bfcache.frame': frame,
                [SENTRY_SEGMENT_NAME]: transactionName,
              },
            });
          });
        },
        true,
      );
    },
  };
}) satisfies IntegrationFn;

function _captureBFCacheNavigation(outcome: 'hit' | 'miss', reasonCount?: number): void {
  const transactionName = _getTransactionName();

  metrics.count('browser.bfcache.navigation', 1, {
    attributes: {
      'browser.bfcache.outcome': outcome,
      'browser.bfcache.not_restored_reason_count': reasonCount,
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
