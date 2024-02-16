import type { ClientOptions, MeasurementUnit, Primitive } from '@sentry/types';
import { logger } from '@sentry/utils';
import type { BaseClient } from '../baseclient';
import { getCurrentScope } from '../currentScopes';
import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { spanToJSON } from '../utils/spanUtils';
import { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';
import { MetricsAggregator, metricsAggregatorIntegration } from './integration';
import type { MetricType } from './types';

interface MetricData {
  unit?: MeasurementUnit;
  tags?: Record<string, Primitive>;
  timestamp?: number;
}

function addToMetricsAggregator(
  metricType: MetricType,
  name: string,
  value: number | string,
  data: MetricData | undefined = {},
): void {
  const client = getClient<BaseClient<ClientOptions>>();
  const scope = getCurrentScope();
  if (client) {
    if (!client.metricsAggregator) {
      DEBUG_BUILD &&
        logger.warn('No metrics aggregator enabled. Please add the MetricsAggregator integration to use metrics APIs');
      return;
    }
    const { unit, tags, timestamp } = data;
    const { release, environment } = client.getOptions();
    // eslint-disable-next-line deprecation/deprecation
    const transaction = scope.getTransaction();
    const metricTags: Record<string, string> = {};
    if (release) {
      metricTags.release = release;
    }
    if (environment) {
      metricTags.environment = environment;
    }
    if (transaction) {
      metricTags.transaction = spanToJSON(transaction).description || '';
    }

    DEBUG_BUILD && logger.log(`Adding value of ${value} to ${metricType} metric ${name}`);
    client.metricsAggregator.add(metricType, name, value, unit, { ...metricTags, ...tags }, timestamp);
  }
}

/**
 * Adds a value to a counter metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
export function increment(name: string, value: number = 1, data?: MetricData): void {
  addToMetricsAggregator(COUNTER_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
export function distribution(name: string, value: number, data?: MetricData): void {
  addToMetricsAggregator(DISTRIBUTION_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
export function set(name: string, value: number | string, data?: MetricData): void {
  addToMetricsAggregator(SET_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
export function gauge(name: string, value: number, data?: MetricData): void {
  addToMetricsAggregator(GAUGE_METRIC_TYPE, name, value, data);
}

export const metrics = {
  increment,
  distribution,
  set,
  gauge,
  /** @deprecated Use `metrics.metricsAggregratorIntegration()` instead. */
  // eslint-disable-next-line deprecation/deprecation
  MetricsAggregator,
  metricsAggregatorIntegration,
};
