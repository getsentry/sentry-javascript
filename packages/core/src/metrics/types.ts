import type { Metric } from '@sentry/types';

export interface MetricData {
  tags?: Metric['tags'];
  unit?: Metric['unit'];
}
