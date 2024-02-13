import { MetricsAggregator } from './aggregator';
import type { MetricData } from './exports';
import { metrics as metricsCore } from './exports';

/**
 * Adds a value to a counter metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function increment(name: string, value: number = 1, data?: MetricData): void {
  metricsCore.increment(MetricsAggregator, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function distribution(name: string, value: number, data?: MetricData): void {
  metricsCore.distribution(MetricsAggregator, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function set(name: string, value: number | string, data?: MetricData): void {
  metricsCore.set(MetricsAggregator, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function gauge(name: string, value: number, data?: MetricData): void {
  metricsCore.gauge(MetricsAggregator, name, value, data);
}

export const metricsDefault = {
  increment,
  distribution,
  set,
  gauge,
  /** @deprecated An integration is no longer required to use the metrics feature */
  // eslint-disable-next-line deprecation/deprecation
  MetricsAggregator: metricsCore.MetricsAggregator,
  /** @deprecated An integration is no longer required to use the metrics feature */
  // eslint-disable-next-line deprecation/deprecation
  metricsAggregatorIntegration: metricsCore.metricsAggregatorIntegration,
};
