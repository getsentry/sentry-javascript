import { BrowserMetricsAggregator, metrics as metricsCore } from '@sentry/core';
import type { DurationUnit, MetricData, Metrics } from '@sentry/types';

/**
 * Adds a value to a counter metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function increment(name: string, value: number = 1, data?: MetricData): void {
  metricsCore.increment(BrowserMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function distribution(name: string, value: number, data?: MetricData): void {
  metricsCore.distribution(BrowserMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function set(name: string, value: number | string, data?: MetricData): void {
  metricsCore.set(BrowserMetricsAggregator, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function gauge(name: string, value: number, data?: MetricData): void {
  metricsCore.gauge(BrowserMetricsAggregator, name, value, data);
}

/**
 * Adds a timing metric.
 * The metric is added as a distribution metric.
 *
 * You can either directly capture a numeric `value`, or wrap a callback function in `timing`.
 * In the latter case, the duration of the callback execution will be captured as a span & a metric.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function timing(name: string, value: number, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): void;
function timing<T>(name: string, callback: () => T, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): T;
function timing<T = void>(
  name: string,
  value: number | (() => T),
  unit: DurationUnit = 'second',
  data?: Omit<MetricData, 'unit'>,
): T | void {
  return metricsCore.timing(BrowserMetricsAggregator, name, value, unit, data);
}

export const metrics: Metrics = {
  increment,
  distribution,
  set,
  gauge,
  timing,
};
