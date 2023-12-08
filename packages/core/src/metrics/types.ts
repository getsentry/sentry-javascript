import type { MeasurementUnit, Primitive } from '@sentry/types';
import type { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';
import { Metric } from './instance';

export type MetricType =
  | typeof COUNTER_METRIC_TYPE
  | typeof GAUGE_METRIC_TYPE
  | typeof SET_METRIC_TYPE
  | typeof DISTRIBUTION_METRIC_TYPE;

/**
 * A metrics aggregator that aggregates metrics in memory and flushes them periodically.
 */
export interface MetricsAggregator {
  /**
   * Add a metric to the aggregator.
   */
  add(
    metricType: MetricType,
    name: string,
    value: number,
    unit?: MeasurementUnit,
    tags?: { [key: string]: Primitive },
    timestamp?: number,
  ): void;

  /**
   * Flushes the current metrics to the transport via the transport.
   */
  flush(): void;
}
