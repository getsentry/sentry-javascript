import type {
  ClientOptions,
  MeasurementUnit,
  MetricsAggregator as MetricsAggregatorInterface,
  Primitive,
} from '@sentry/types';
import { logger } from '@sentry/utils';
import type { BaseClient } from '../baseclient';
import { DEBUG_BUILD } from '../debug-build';
import { getClient, getCurrentScope } from '../exports';
import { spanToJSON } from '../utils/spanUtils';
import { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';
import { MetricsAggregator, metricsAggregatorIntegration } from './integration';
import type { MetricType } from './types';

export interface MetricData {
  unit?: MeasurementUnit;
  tags?: Record<string, Primitive>;
  timestamp?: number;
}

type MetricsAggregatorConstructor = {
  new (client: BaseClient<ClientOptions>): MetricsAggregatorInterface;
};

/**
 * Global metrics aggregator instance.
 *
 * This is initialized on the first call to any `Sentry.metric.*` method.
 */
let globalMetricsAggregator: MetricsAggregatorInterface | undefined;

function addToMetricsAggregator(
  Aggregator: MetricsAggregatorConstructor,
  metricType: MetricType,
  name: string,
  value: number | string,
  data: MetricData | undefined = {},
): void {
  const client = getClient<BaseClient<ClientOptions>>();
  if (!client) {
    return;
  }

  if (!globalMetricsAggregator) {
    const aggregator = (globalMetricsAggregator = new Aggregator(client));

    client.on('flush', () => aggregator.flush());
    client.on('close', () => aggregator.close());
  }

  if (client) {
    const scope = getCurrentScope();
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
    globalMetricsAggregator.add(metricType, name, value, unit, { ...metricTags, ...tags }, timestamp);
  }
}

/**
 * Adds a value to a counter metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function increment(aggregator: MetricsAggregatorConstructor, name: string, value: number = 1, data?: MetricData): void {
  addToMetricsAggregator(aggregator, COUNTER_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a distribution metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function distribution(aggregator: MetricsAggregatorConstructor, name: string, value: number, data?: MetricData): void {
  addToMetricsAggregator(aggregator, DISTRIBUTION_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function set(aggregator: MetricsAggregatorConstructor, name: string, value: number | string, data?: MetricData): void {
  addToMetricsAggregator(aggregator, SET_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @experimental This API is experimental and might have breaking changes in the future.
 */
function gauge(aggregator: MetricsAggregatorConstructor, name: string, value: number, data?: MetricData): void {
  addToMetricsAggregator(aggregator, GAUGE_METRIC_TYPE, name, value, data);
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
