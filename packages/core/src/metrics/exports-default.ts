import type { Client, MetricsAggregator as MetricsAggregatorInterface } from '@sentry/types';
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

/**
 * Returns the metrics aggregator for a given client.
 */
function getMetricsAggregatorForClient(client: Client): MetricsAggregatorInterface {
  return metricsCore.getMetricsAggregatorForClient(client, MetricsAggregator);
}

export const metricsDefault = {
  increment,
  distribution,
  set,
  gauge,
  /**
   * @ignore This is for internal use only.
   */
  getMetricsAggregatorForClient,
};
