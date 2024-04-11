import type { Client, MeasurementUnit, MetricsAggregator, Primitive } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
import { updateMetricSummaryOnActiveSpan } from '../utils/spanUtils';
import { DEFAULT_BROWSER_FLUSH_INTERVAL, SET_METRIC_TYPE } from './constants';
import { captureAggregateMetrics } from './envelope';
import { METRIC_MAP } from './instance';
import type { MetricBucket, MetricType } from './types';
import { getBucketKey, sanitizeMetricKey, sanitizeTags, sanitizeUnit } from './utils';

/**
 * A simple metrics aggregator that aggregates metrics in memory and flushes them periodically.
 * Default flush interval is 5 seconds.
 *
 * @experimental This API is experimental and might change in the future.
 */
export class BrowserMetricsAggregator implements MetricsAggregator {
  // TODO(@anonrig): Use FinalizationRegistry to have a proper way of flushing the buckets
  // when the aggregator is garbage collected.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry
  private _buckets: MetricBucket;
  private readonly _interval: ReturnType<typeof setInterval>;

  public constructor(private readonly _client: Client) {
    this._buckets = new Map();
    this._interval = setInterval(() => this.flush(), DEFAULT_BROWSER_FLUSH_INTERVAL);
  }

  /**
   * @inheritDoc
   */
  public add(
    metricType: MetricType,
    unsanitizedName: string,
    value: number | string,
    unsanitizedUnit: MeasurementUnit | undefined = 'none',
    unsanitizedTags: Record<string, Primitive> | undefined = {},
    maybeFloatTimestamp: number | undefined = timestampInSeconds(),
  ): void {
    const timestamp = Math.floor(maybeFloatTimestamp);
    const name = sanitizeMetricKey(unsanitizedName);
    const tags = sanitizeTags(unsanitizedTags);
    const unit = sanitizeUnit(unsanitizedUnit as string);

    const bucketKey = getBucketKey(metricType, name, unit, tags);

    let bucketItem = this._buckets.get(bucketKey);
    // If this is a set metric, we need to calculate the delta from the previous weight.
    const previousWeight = bucketItem && metricType === SET_METRIC_TYPE ? bucketItem.metric.weight : 0;

    if (bucketItem) {
      bucketItem.metric.add(value);
      // TODO(abhi): Do we need this check?
      if (bucketItem.timestamp < timestamp) {
        bucketItem.timestamp = timestamp;
      }
    } else {
      bucketItem = {
        // @ts-expect-error we don't need to narrow down the type of value here, saves bundle size.
        metric: new METRIC_MAP[metricType](value),
        timestamp,
        metricType,
        name,
        unit,
        tags,
      };
      this._buckets.set(bucketKey, bucketItem);
    }

    // If value is a string, it's a set metric so calculate the delta from the previous weight.
    const val = typeof value === 'string' ? bucketItem.metric.weight - previousWeight : value;
    updateMetricSummaryOnActiveSpan(metricType, name, val, unit, unsanitizedTags, bucketKey);
  }

  /**
   * @inheritDoc
   */
  public flush(): void {
    // short circuit if buckets are empty.
    if (this._buckets.size === 0) {
      return;
    }

    const metricBuckets = Array.from(this._buckets.values());
    captureAggregateMetrics(this._client, metricBuckets);

    this._buckets.clear();
  }

  /**
   * @inheritDoc
   */
  public close(): void {
    clearInterval(this._interval);
    this.flush();
  }
}
