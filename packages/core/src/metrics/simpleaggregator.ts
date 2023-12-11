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
    unsanitizedTags: { [key: string]: Primitive } = {},
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
 */
export function serializeBuckets(buckets: SimpleMetricBucket): string {
  let out = '';
  buckets.forEach(([metric, timestamp, metricType, name, unit, tags]) => {
    out += `${name}@${unit}:${metric}|${metricType}`;
    if (Object.keys(tags).length) {
      out += '|#';
      out += Object.entries(tags)
        .map(([key, value]) => `${key}:${String(value)}`)
        .join(',');
    }
    // timestamp must be an integer
    out += `|T${timestamp}\n`;
  });

  return out;
}

function sanitizeTags(unsanitizedTags: { [key: string]: Primitive }): { [key: string]: string } {
  const tags: { [key: string]: string } = {};
  for (const key in unsanitizedTags) {
    if (Object.prototype.hasOwnProperty.call(unsanitizedTags, key)) {
      const sanitizedKey = key.replace(NAME_AND_TAG_KEY_NORMALIZATION_REGEX, '_');
      tags[sanitizedKey] = String(unsanitizedTags[key]).replace(TAG_VALUE_NORMALIZATION_REGEX, '_');
    }
  }
  return tags;
}
