import type { Metrics } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

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
};
