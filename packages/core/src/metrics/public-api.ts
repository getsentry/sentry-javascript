import type { Scope } from '../scope';
import type { Metric, MetricType } from '../types-hoist/metric';
import { _INTERNAL_captureMetric } from './internal';

/**
 * Options for capturing a metric.
 */
export interface MetricOptions {
  /**
   * The unit of the metric value.
   */
  unit?: string;

  /**
   * Arbitrary structured data that stores information about the metric.
   */
  attributes?: Metric['attributes'];

  /**
   * The scope to capture the metric with.
   */
  scope?: Scope;

  /**
   * The sample rate for the metric. Must be a float between 0 (exclusive) and 1 (inclusive).
   */
  sample_rate?: number;
}

/**
 * Capture a metric with the given type, name, and value.
 *
 * @param type - The type of the metric.
 * @param name - The name of the metric.
 * @param value - The value of the metric.
 * @param options - Options for capturing the metric.
 */
function captureMetric(type: MetricType, name: string, value: number | string, options?: MetricOptions): void {
  _INTERNAL_captureMetric(
    { type, name, value, unit: options?.unit, attributes: options?.attributes, sample_rate: options?.sample_rate },
    { scope: options?.scope },
  );
}

/**
 * @summary Increment a counter metric. Requires the `_experiments.enableMetrics` option to be enabled.
 *
 * @param name - The name of the counter metric.
 * @param value - The value to increment by (defaults to 1).
 * @param options - Options for capturing the metric.
 * @param options.sample_rate - Sample rate for the metric (0 < sample_rate <= 1.0).
 *
 * @example
 *
 * ```
 * Sentry.metrics.count('api.requests', 1, {
 *   attributes: {
 *     endpoint: '/api/users',
 *     method: 'GET',
 *     status: 200
 *   }
 * });
 * ```
 *
 * @example With custom value and sample rate
 *
 * ```
 * Sentry.metrics.count('items.processed', 5, {
 *   attributes: {
 *     processor: 'batch-processor',
 *     queue: 'high-priority'
 *   },
 *   sample_rate: 0.1
 * });
 * ```
 */
export function count(name: string, value: number = 1, options?: MetricOptions): void {
  captureMetric('counter', name, value, options);
}

/**
 * @summary Set a gauge metric to a specific value. Requires the `_experiments.enableMetrics` option to be enabled.
 *
 * @param name - The name of the gauge metric.
 * @param value - The current value of the gauge.
 * @param options - Options for capturing the metric.
 * @param options.sample_rate - Sample rate for the metric (0 < sample_rate <= 1.0).
 *
 * @example
 *
 * ```
 * Sentry.metrics.gauge('memory.usage', 1024, {
 *   unit: 'megabyte',
 *   attributes: {
 *     process: 'web-server',
 *     region: 'us-east-1'
 *   }
 * });
 * ```
 *
 * @example With sample rate
 *
 * ```
 * Sentry.metrics.gauge('active.connections', 42, {
 *   attributes: {
 *     server: 'api-1',
 *     protocol: 'websocket'
 *   },
 *   sample_rate: 0.5
 * });
 * ```
 */
export function gauge(name: string, value: number, options?: MetricOptions): void {
  captureMetric('gauge', name, value, options);
}

/**
 * @summary Record a value in a distribution metric. Requires the `_experiments.enableMetrics` option to be enabled.
 *
 * @param name - The name of the distribution metric.
 * @param value - The value to record in the distribution.
 * @param options - Options for capturing the metric.
 * @param options.sample_rate - Sample rate for the metric (0 < sample_rate <= 1.0).
 *
 * @example
 *
 * ```
 * Sentry.metrics.distribution('task.duration', 500, {
 *   unit: 'millisecond',
 *   attributes: {
 *     task: 'data-processing',
 *     priority: 'high'
 *   }
 * });
 * ```
 *
 * @example With sample rate
 *
 * ```
 * Sentry.metrics.distribution('batch.size', 100, {
 *   attributes: {
 *     processor: 'batch-1',
 *     type: 'async'
 *   },
 *   sample_rate: 0.25
 * });
 * ```
 */
export function distribution(name: string, value: number, options?: MetricOptions): void {
  captureMetric('distribution', name, value, options);
}
