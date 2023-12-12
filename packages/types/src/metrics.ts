import type { MeasurementUnit } from './measurement';
import type { Primitive } from './misc';

export interface MetricInstance {
  /**
   * Adds a value to a metric.
   */
  add(value: number | string): void;
  /**
   * Serializes the metric into a statsd format string.
   */
  toString(): string;
}

export type MetricBucketItem = [
  metric: MetricInstance,
  timestamp: number,
  metricType: 'c' | 'g' | 's' | 'd',
  name: string,
  unit: MeasurementUnit,
  tags: { [key: string]: string },
];

/**
 * A metrics aggregator that aggregates metrics in memory and flushes them periodically.
 */
export interface MetricsAggregator {
  /**
   * Add a metric to the aggregator.
   */
  add(
    metricType: 'c' | 'g' | 's' | 'd',
    name: string,
    value: number | string,
    unit?: MeasurementUnit,
    tags?: Record<string, Primitive>,
    timestamp?: number,
  ): void;

  /**
   * Flushes the current metrics to the transport via the transport.
   */
  flush(): void;

  /**
   * Shuts down metrics aggregator and clears all metrics.
   */
  close(): void;

  /**
   * Returns a string representation of the aggregator.
   */
  toString(): string;
}
