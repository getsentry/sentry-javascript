import { consoleSandbox } from '@sentry/core';
import type { Metrics } from '@sentry/core';

function warn(): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('You are using metrics even though this bundle does not include tracing.');
  });
}

export const metricsShim: Metrics = {
  increment: warn,
  distribution: warn,
  set: warn,
  gauge: warn,
  timing: (_name: unknown, value: number | (() => unknown)) => {
    warn();
    if (typeof value === 'function') {
      return value();
    }
  },
};
