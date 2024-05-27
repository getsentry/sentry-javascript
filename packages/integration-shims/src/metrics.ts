import type { Metrics } from '@sentry/types';

export const metricsShim: Metrics = {
  /* eslint-disable @typescript-eslint/no-empty-function */
  increment: () => {},
  distribution: () => {},
  set: () => {},
  gauge: () => {},
  /* eslint-enable @typescript-eslint/no-empty-function */
};
