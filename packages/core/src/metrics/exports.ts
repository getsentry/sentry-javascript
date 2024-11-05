import type { Client, DurationUnit, MetricData, MetricsAggregator as MetricsAggregatorInterface } from '@sentry/types';
import { getGlobalSingleton, logger, timestampInSeconds } from '@sentry/utils';
import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { startSpanManual } from '../tracing';
import { handleCallbackErrors } from '../utils/handleCallbackErrors';
import { getActiveSpan, getRootSpan, spanToJSON } from '../utils/spanUtils';
import { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';
import type { MetricType } from './types';

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
  const transactionName = rootSpan && spanToJSON(rootSpan).description;

  const { unit, tags, timestamp } = data;
  const { release, environment } = client.getOptions();
  const metricTags: Record<string, string> = {};
  if (release) {
    metricTags.release = release;
  }
  if (environment) {
    metricTags.environment = environment;
  }
  if (transactionName) {
    metricTags.transaction = transactionName;
  }

  DEBUG_BUILD && logger.log(`Adding value of ${value} to ${metricType} metric ${name}`);

  const aggregator = getMetricsAggregatorForClient(client, Aggregator);
  aggregator.add(metricType, name, value, unit, { ...metricTags, ...tags }, timestamp);
}

/**
 * Adds a value to a counter metric
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function increment(aggregator: MetricsAggregatorConstructor, name: string, value: number = 1, data?: MetricData): void {
  addToMetricsAggregator(aggregator, COUNTER_METRIC_TYPE, name, ensureNumber(value), data);
}

/**
 * Adds a value to a distribution metric
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function distribution(aggregator: MetricsAggregatorConstructor, name: string, value: number, data?: MetricData): void {
  addToMetricsAggregator(aggregator, DISTRIBUTION_METRIC_TYPE, name, ensureNumber(value), data);
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
function timing<T = void>(
  aggregator: MetricsAggregatorConstructor,
  name: string,
  value: number | (() => T),
  unit: DurationUnit = 'second',
  data?: Omit<MetricData, 'unit'>,
): T | void {
  // callback form
  if (typeof value === 'function') {
    const startTime = timestampInSeconds();

    return startSpanManual(
      {
        op: 'metrics.timing',
        name,
        startTime,
        onlyIfParent: true,
      },
      span => {
        return handleCallbackErrors(
          () => value(),
          () => {
            // no special error handling necessary
          },
          () => {
            const endTime = timestampInSeconds();
            const timeDiff = endTime - startTime;
            // eslint-disable-next-line deprecation/deprecation
            distribution(aggregator, name, timeDiff, { ...data, unit: 'second' });
            span.end(endTime);
          },
        );
      },
    );
  }

  // value form
  // eslint-disable-next-line deprecation/deprecation
  distribution(aggregator, name, value, { ...data, unit });
}

/**
 * Adds a value to a set metric. Value must be a string or integer.
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function set(aggregator: MetricsAggregatorConstructor, name: string, value: number | string, data?: MetricData): void {
  addToMetricsAggregator(aggregator, SET_METRIC_TYPE, name, value, data);
}

/**
 * Adds a value to a gauge metric
 *
 * @deprecated The Sentry metrics beta has ended. This method will be removed in a future release.
 */
function gauge(aggregator: MetricsAggregatorConstructor, name: string, value: number, data?: MetricData): void {
  addToMetricsAggregator(aggregator, GAUGE_METRIC_TYPE, name, ensureNumber(value), data);
}

/**
 * The metrics API is used to capture custom metrics in Sentry.
 *
 * @deprecated The Sentry metrics beta has ended. This export will be removed in a future release.
 */
export const metrics = {
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

// Although this is typed to be a number, we try to handle strings as well here
function ensureNumber(number: number | string): number {
  return typeof number === 'string' ? parseInt(number) : number;
}
