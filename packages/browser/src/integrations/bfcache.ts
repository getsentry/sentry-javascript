import type { IntegrationFn } from '@sentry/core/browser';
import { debug, defineIntegration, getCurrentScope, metrics } from '@sentry/core/browser';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

const INTEGRATION_NAME = 'BFCacheMetrics';
const DEFAULT_MAX_REASONS = 5;

type BFCacheFrame = 'top' | 'child' | 'masked' | 'unknown';

interface BFCacheIntegrationOptions {
  /**
   * Maximum number of not-restored reasons to emit per miss.
   *
   * Defaults to 5.
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
  const maxReasons = options.maxReasons ?? DEFAULT_MAX_REASONS;

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
                ...(transactionName ? { 'sentry.transaction': transactionName } : {}),
              },
            });
          }

          reasons.forEach(({ reason, frame }) => {
            const transactionName = _getTransactionName();

            metrics.count('browser.bfcache.not_restored', 1, {
              attributes: {
                'browser.bfcache.reason': reason,
                'browser.bfcache.frame': frame,
                ...(transactionName ? { 'sentry.transaction': transactionName } : {}),
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
      ...(reasonCount != null ? { 'browser.bfcache.not_restored_reason_count': reasonCount } : {}),
      ...(transactionName ? { 'sentry.transaction': transactionName } : {}),
    },
  });
}

function _getTransactionName(): string | undefined {
  return getCurrentScope().getScopeData().transactionName || WINDOW.location?.pathname;
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
      frame: reasonValue === 'masked' ? 'masked' : frameType,
    });
  });

  frame.children?.forEach(child => {
    _collectReasonsFromFrame(child, 'child', collectedReasons, maxReasons);
  });
}
