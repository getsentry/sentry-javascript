import type {
  Client,
  DurationUnit,
  MetricData,
  Metrics,
  MetricsAggregator as MetricsAggregatorInterface,
} from '@sentry/types';
import { MetricsAggregator } from './aggregator';
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
  return metricsCore.timing(MetricsAggregator, name, value, unit, data);
}

/**
 * Returns the metrics aggregator for a given client.
 */
function getMetricsAggregatorForClient(client: Client): MetricsAggregatorInterface {
  return metricsCore.getMetricsAggregatorForClient(client, MetricsAggregator);
}

export const metricsDefault: Metrics & {
  getMetricsAggregatorForClient: typeof getMetricsAggregatorForClient;
} = {
  increment,
  distribution,
  set,
  gauge,
  timing,
  /**
   * @ignore This is for internal use only.
   */
  getMetricsAggregatorForClient,
};
