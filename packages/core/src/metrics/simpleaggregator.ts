import type { Client, ClientOptions, MeasurementUnit, Primitive } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
import {
  DEFAULT_FLUSH_INTERVAL,
  NAME_AND_TAG_KEY_NORMALIZATION_REGEX,
  TAG_VALUE_NORMALIZATION_REGEX,
} from './constants';
import type { Metric } from './instance';
import { METRIC_MAP } from './instance';
import type { MetricType, MetricsAggregator } from './types';
import { getBucketKey } from './utils';

type SimpleMetricBucket = Map<
  string,
  [
    metric: Metric,
    timestamp: number,
    metricType: MetricType,
    name: string,
    unit: MeasurementUnit,
    tags: { [key: string]: string },
  ]
>;

/**
 * A simple metrics aggregator that aggregates metrics in memory and flushes them periodically.
 * Default flush interval is 5 seconds.
 *
 * @experimental This API is experimental and might change in the future.
 */
export class SimpleMetricsAggregator implements MetricsAggregator {
  private _buckets: SimpleMetricBucket;
  private readonly _interval: ReturnType<typeof setInterval>;

  public constructor(private readonly _client: Client<ClientOptions>) {
    this._buckets = new Map();
    this._interval = setInterval(() => this.flush(), DEFAULT_FLUSH_INTERVAL);
  }

  /**
   * @inheritDoc
   */
  public add(
    metricType: MetricType,
    unsanitizedName: string,
    value: number,
    unit: MeasurementUnit = 'none',
    unsanitizedTags: Record<string, Primitive> = {},
    maybeFloatTimestamp = timestampInSeconds(),
  ): void {
    const timestamp = Math.floor(maybeFloatTimestamp);
    const name = unsanitizedName.replace(NAME_AND_TAG_KEY_NORMALIZATION_REGEX, '_');
    const tags = sanitizeTags(unsanitizedTags);

    const bucketKey = getBucketKey(metricType, name, unit, tags);
    const bucketItem = this._buckets.get(bucketKey);
    if (bucketItem) {
      const [bucketMetric, bucketTimestamp] = bucketItem;
      bucketMetric.add(value);
      // TODO(abhi): Do we need this check?
      if (bucketTimestamp < timestamp) {
        bucketItem[1] = timestamp;
      }
    } else {
      const newMetric = new METRIC_MAP[metricType](value);
      this._buckets.set(bucketKey, [newMetric, timestamp, metricType, name, unit, tags]);
    }
  }

  /**
   * @inheritDoc
   */
  public flush(): void {
    // short circuit if buckets are empty.
    if (this._buckets.size === 0) {
      return;
    }

    if (this._client.captureSerializedMetrics) {
      this._client.captureSerializedMetrics(serializeBuckets(this._buckets));
    }
    this._buckets.clear();
  }

  /**
   * @inheritDoc
   */
  public close(): void {
    clearInterval(this._interval);
    this.flush();
    this._buckets.clear();
  }
}

/**
 * Serialize metrics buckets into a string based on statsd format.
 *
 * Example of format:
 * metric.name@second:1:1.2|d|#a:value,b:anothervalue|T12345677
 * Segments:
 * name: metric.name
 * unit: second
 * value: [1, 1.2]
 * type of metric: d (distribution)
 * tags: { a: value, b: anothervalue }
 * timestamp: 12345677
 */
export function serializeBuckets(buckets: SimpleMetricBucket): string {
  let out = '';
  buckets.forEach(([metric, timestamp, metricType, name, unit, tags]) => {
    const maybeTags = Object.keys(tags).length
      ? `|#${Object.entries(tags)
          .map(([key, value]) => `${key}:${String(value)}`)
          .join(',')}`
      : '';
    out += `${name}@${unit}:${metric}|${metricType}${maybeTags}|T${timestamp}\n`;
  });

  return out;
}

function sanitizeTags(unsanitizedTags: Record<string, Primitive>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const key in unsanitizedTags) {
    if (Object.prototype.hasOwnProperty.call(unsanitizedTags, key)) {
      const sanitizedKey = key.replace(NAME_AND_TAG_KEY_NORMALIZATION_REGEX, '_');
      tags[sanitizedKey] = String(unsanitizedTags[key]).replace(TAG_VALUE_NORMALIZATION_REGEX, '_');
    }
  }
  return tags;
}
