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
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function increment(name: string, value: number = 1, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.increment(MetricsAggregator, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function distribution(name: string, value: number, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.distribution(MetricsAggregator, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function set(name: string, value: number | string, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.set(MetricsAggregator, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function gauge(name: string, value: number, data?: MetricData): void {
  // eslint-disable-next-line deprecation/deprecation
  metricsCore.gauge(MetricsAggregator, name, value, data);
}

/**
 * Adds a timing metric.
 * The metric is added as a distribution metric.
 *
 * You can either directly capture a numeric `value`, or wrap a callback function in `timing`.
 * In the latter case, the duration of the callback execution will be captured as a span & a metric.
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function timing(name: string, value: number, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): void;
function timing<T>(name: string, callback: () => T, unit?: DurationUnit, data?: Omit<MetricData, 'unit'>): T;
function timing<T = void>(
  name: string,
  value: number | (() => T),
  unit: DurationUnit = 'second',
  data?: Omit<MetricData, 'unit'>,
): T | void {
  // eslint-disable-next-line deprecation/deprecation
  return metricsCore.timing(MetricsAggregator, name, value, unit, data);
}

/**
 * Returns the metrics aggregator for a given client.
 */
function getMetricsAggregatorForClient(client: Client): MetricsAggregatorInterface {
  // eslint-disable-next-line deprecation/deprecation
  return metricsCore.getMetricsAggregatorForClient(client, MetricsAggregator);
}

/**
 * The metrics API is used to capture custom metrics in Sentry.
 *
 * @deprecated The Sentry metrics beta has ended. This export will be removed in a future release.
 */
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
