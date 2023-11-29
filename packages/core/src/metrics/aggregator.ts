import type { CounterMetric, DistributionMetric, GaugeMetric, MeasurementUnit, Metric, SetMetric } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

const COUNTER_METRIC_TYPE = 'c';
const GAUGE_METRIC_TYPE = 'g';
const SET_METRIC_TYPE = 's';
const DISTRIBUTION_METRIC_TYPE = 'd';

export type MetricType =
  | typeof COUNTER_METRIC_TYPE
  | typeof GAUGE_METRIC_TYPE
  | typeof SET_METRIC_TYPE
  | typeof DISTRIBUTION_METRIC_TYPE;

const DEFAULT_FLUSH_TIMEOUT_IN_MS = 5000;

/**
 * A simple metrics aggregator that aggregates metrics in memory and flushes them periodically.
 */
export class SimpleMetricsAggregator {
  private _buckets: Map<string, Metric>;
  private _intervalId: ReturnType<typeof setInterval>;

  public constructor() {
    this._buckets = new Map();

    this._intervalId = setInterval(() => this.flush(), DEFAULT_FLUSH_TIMEOUT_IN_MS);
  }

  /** JSDoc */
  public add(
    metricType: MetricType,
    name: string,
    value: number,
    unit: MeasurementUnit = 'none',
    tags: Metric['tags'] = {},
  ): void {
    // In order to generate a stable unique key for the bucket, we need ensure tag key order is consistent, hence the sorting
    const stringifiedTags = JSON.stringify(Object.keys(tags).sort());
    const bucketKey = [metricType, name, value].concat(stringifiedTags).join('');

    const maybeMetric = this._buckets.get(bucketKey);
    if (maybeMetric) {
      addMetric[metricType](maybeMetric, value);
    } else {
      createMetric[metricType](bucketKey, name, value, unit, tags);
    }

    if (!this._metrics.has(bucketKey)) {
      this._metrics.set(bucketKey, {
        name,
        type: COUNTER_METRIC_TYPE,
        value,
        unit,
        tags,
        timestamp,
      });
    } else {
      const metric = this._metrics.get(bucketKey);
      metric.value += value;
      metric.timestamp = timestamp;
    }
  }

  /**
   * Flushes metrics from buckets and captures them using client
   */
  public flush(): void {
    // TODO
  }

  /** JSDoc */
  public close(): void {
    clearInterval(this._intervalId);
    this.flush();
  }
}

function addCounterMetric(metric: CounterMetric, value: number): void {
  metric.value += value;
}

function addGaugeMetric(metric: GaugeMetric, value: number): void {
  metric.value = value;
  metric.last = value;
  metric.min = Math.min(metric.min, value);
  metric.max = Math.max(metric.max, value);
  metric.sum += value;
  metric.count += 1;
}

function addSetMetric(metric: SetMetric, value: number): void {
  metric.value.add(value);
}

function addDistributionMetric(metric: DistributionMetric, value: number): void {
  metric.value.push(value);
}

function createCounterMetric(
  name: string,
  value: number,
  unit: MeasurementUnit,
  tags: NonNullable<Metric['tags']>,
): CounterMetric {
  return {
    name,
    value,
    unit,
    timestamp: timestampInSeconds(),
    tags,
    add: (newValue: number) => {
      this.value += newValue;
    },
  };
}
