import type {
  Client,
  MeasurementUnit,
  MetricsAggregator as MetricsAggregatorInterface,
  Primitive,
} from '@sentry/types';
import { getGlobalSingleton, logger } from '@sentry/utils';
import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { getActiveSpan, getRootSpan, spanToJSON } from '../utils/spanUtils';
import { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';
import type { MetricType } from './types';

export interface MetricData {
  unit?: MeasurementUnit;
  tags?: Record<string, Primitive>;
  timestamp?: number;
  client?: Client;
}

type MetricsAggregatorConstructor = {
  new (client: Client): MetricsAggregatorInterface;
};

/**
 * Gets the metrics aggregator for a given client.
 * @param client The client for which to get the metrics aggregator.
 * @param Aggregator Optional metrics aggregator class to use to create an aggregator if one does not exist.
 */
function getMetricsAggregatorForClient(
  client: Client,
  Aggregator: MetricsAggregatorConstructor,
): MetricsAggregatorInterface {
  const globalMetricsAggregators = getGlobalSingleton<WeakMap<Client, MetricsAggregatorInterface>>(
    'globalMetricsAggregators',
    () => new WeakMap(),
  );

  const aggregator = globalMetricsAggregators.get(client);
  if (aggregator) {
    return aggregator;
  }

  const newAggregator = new Aggregator(client);
  client.on('flush', () => newAggregator.flush());
  client.on('close', () => newAggregator.close());
  globalMetricsAggregators.set(client, newAggregator);

  return newAggregator;
}

function addToMetricsAggregator(
  Aggregator: MetricsAggregatorConstructor,
  metricType: MetricType,
  name: string,
  value: number | string,
  data: MetricData | undefined = {},
): void {
  const client = data.client || getClient<Client>();

  if (!client) {
    return;
  }

  const span = getActiveSpan();
  const rootSpan = span ? getRootSpan(span) : undefined;

  const { unit, tags, timestamp } = data;
  const { release, environment } = client.getOptions();
  const metricTags: Record<string, string> = {};
  if (release) {
    metricTags.release = release;
  }
  if (environment) {
    metricTags.environment = environment;
  }
  if (rootSpan) {
    metricTags.transaction = spanToJSON(rootSpan).description || '';
  }

  DEBUG_BUILD && logger.log(`Adding value of ${value} to ${metricType} metric ${name}`);

  const aggregator = getMetricsAggregatorForClient(client, Aggregator);
  aggregator.add(metricType, name, value, unit, { ...metricTags, ...tags }, timestamp);
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
  /**
   * @ignore This is for internal use only.
   */
  getMetricsAggregatorForClient,
};
