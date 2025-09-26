import type { Scope } from '../scope';
import type { Metric, MetricType } from '../types-hoist/metric';
import { _INTERNAL_captureMetric } from './internal';

/**
 * Capture a metric with the given type, name, and value.
 *
 * @param type - The type of the metric.
 * @param name - The name of the metric.
 * @param value - The value of the metric.
 * @param unit - The unit of the metric value.
 * @param attributes - Arbitrary structured data that stores information about the metric.
 * @param scope - The scope to capture the metric with.
 */
function captureMetric(
  type: MetricType,
  name: string,
  value: number | string,
  unit?: string,
  attributes?: Metric['attributes'],
  scope?: Scope,
): void {
  _INTERNAL_captureMetric({ type, name, value, unit, attributes }, scope);
}

/**
 * Additional metadata to capture the metric with.
 */
interface CaptureMetricMetadata {
  scope?: Scope;
}

/**
 * @summary Increment a counter metric. Requires the `_enableTraceMetrics` option to be enabled.
 *
 * @param name - The name of the counter metric.
 * @param value - The value to increment by (defaults to 1).
 * @param attributes - Arbitrary structured data that stores information about the metric.
 * @param metadata - additional metadata to capture the metric with.
 *
 * @example
 *
 * ```
 * Sentry.metrics.count('api.requests', 1, {
 *   endpoint: '/api/users',
 *   method: 'GET',
 *   status: 200
 * });
 * ```
 *
 * @example With custom value
 *
 * ```
 * Sentry.metrics.count('items.processed', 5, {
 *   processor: 'batch-processor',
 *   queue: 'high-priority'
 * });
 * ```
 */
export function count(
  name: string,
  value: number = 1,
  attributes?: Metric['attributes'],
  { scope }: CaptureMetricMetadata = {},
): void {
  captureMetric('counter', name, value, undefined, attributes, scope);
}

/**
 * @summary Set a gauge metric to a specific value. Requires the `_enableTraceMetrics` option to be enabled.
 *
 * @param name - The name of the gauge metric.
 * @param value - The current value of the gauge.
 * @param unit - The unit of the metric value.
 * @param attributes - Arbitrary structured data that stores information about the metric.
 * @param metadata - additional metadata to capture the metric with.
 *
 * @example
 *
 * ```
 * Sentry.metrics.gauge('memory.usage', 1024, 'megabyte', {
 *   process: 'web-server',
 *   region: 'us-east-1'
 * });
 * ```
 *
 * @example Without unit
 *
 * ```
 * Sentry.metrics.gauge('active.connections', 42, undefined, {
 *   server: 'api-1',
 *   protocol: 'websocket'
 * });
 * ```
 */
export function gauge(
  name: string,
  value: number,
  unit?: string,
  attributes?: Metric['attributes'],
  { scope }: CaptureMetricMetadata = {},
): void {
  captureMetric('gauge', name, value, unit, attributes, scope);
}

/**
 * @summary Record a value in a histogram metric. Requires the `_enableTraceMetrics` option to be enabled.
 *
 * @param name - The name of the histogram metric.
 * @param value - The value to record in the histogram.
 * @param unit - The unit of the metric value.
 * @param attributes - Arbitrary structured data that stores information about the metric.
 * @param metadata - additional metadata to capture the metric with.
 *
 * @example
 *
 * ```
 * Sentry.metrics.histogram('response.time', 150, 'millisecond', {
 *   endpoint: '/api/data',
 *   method: 'POST',
 *   status: 201
 * });
 * ```
 *
 * @example Without unit
 *
 * ```
 * Sentry.metrics.histogram('file.size', 2048, undefined, {
 *   type: 'upload',
 *   format: 'pdf'
 * });
 * ```
 */
export function histogram(
  name: string,
  value: number,
  unit?: string,
  attributes?: Metric['attributes'],
  { scope }: CaptureMetricMetadata = {},
): void {
  captureMetric('histogram', name, value, unit, attributes, scope);
}

/**
 * @summary Record a value in a distribution metric. Requires the `_enableTraceMetrics` option to be enabled.
 *
 * @param name - The name of the distribution metric.
 * @param value - The value to record in the distribution.
 * @param unit - The unit of the metric value.
 * @param attributes - Arbitrary structured data that stores information about the metric.
 * @param metadata - additional metadata to capture the metric with.
 *
 * @example
 *
 * ```
 * Sentry.metrics.distribution('task.duration', 500, 'millisecond', {
 *   task: 'data-processing',
 *   priority: 'high'
 * });
 * ```
 *
 * @example Without unit
 *
 * ```
 * Sentry.metrics.distribution('batch.size', 100, undefined, {
 *   processor: 'batch-1',
 *   type: 'async'
 * });
 * ```
 */
export function distribution(
  name: string,
  value: number,
  unit?: string,
  attributes?: Metric['attributes'],
  { scope }: CaptureMetricMetadata = {},
): void {
  captureMetric('distribution', name, value, unit, attributes, scope);
}

/**
 * @summary Add a value to a set metric. Requires the `_enableTraceMetrics` option to be enabled.
 *
 * @param name - The name of the set metric.
 * @param value - The value to add to the set (can be string or number).
 * @param attributes - Arbitrary structured data that stores information about the metric.
 * @param metadata - additional metadata to capture the metric with.
 *
 * @example
 *
 * ```
 * Sentry.metrics.set('unique.users', 'user-123', {
 *   page: '/dashboard',
 *   action: 'view'
 * });
 * ```
 *
 * @example With numeric value
 *
 * ```
 * Sentry.metrics.set('unique.error.codes', 404, {
 *   service: 'api',
 *   environment: 'production'
 * });
 * ```
 */
export function set(
  name: string,
  value: string | number,
  attributes?: Metric['attributes'],
  { scope }: CaptureMetricMetadata = {},
): void {
  captureMetric('set', name, value, undefined, attributes, scope);
}
