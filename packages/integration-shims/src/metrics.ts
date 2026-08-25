import { consoleSandbox } from '@sentry/core/browser';
import { DEBUG_BUILD } from './debug-build';

/**
 * This is a shim for the metrics namespace.
 * It is needed in order for the CDN bundles to continue working when users add/remove metrics
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
function metricShim(_name: unknown, _value?: unknown, _options?: unknown): void {
  DEBUG_BUILD &&
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('You are using Sentry.metrics.* even though this bundle does not include metrics.');
    });
}

export const metricsShim = {
  count: metricShim,
  gauge: metricShim,
  distribution: metricShim,
};
