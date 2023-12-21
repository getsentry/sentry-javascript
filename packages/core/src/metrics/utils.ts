import type { MeasurementUnit, MetricBucketItem } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import type { MetricType } from './types';

/**
 * Generate bucket key from metric properties.
 */
export function getBucketKey(
  metricType: MetricType,
  name: string,
  unit: MeasurementUnit,
  tags: Record<string, string>,
): string {
  const stringifiedTags = Object.entries(dropUndefinedKeys(tags)).sort((a, b) => a[0].localeCompare(b[0]));
  return `${metricType}${name}${unit}${stringifiedTags}`;
}

/* eslint-disable no-bitwise */
/**
 * Simple hash function for strings.
 */
export function simpleHash(s: string): number {
  let rv = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    rv = (rv << 5) - rv + c;
    rv &= rv;
  }
  return rv >>> 0;
}
/* eslint-enable no-bitwise */

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
export function serializeMetricBuckets(metricBucketItems: Array<MetricBucketItem>): string {
  let out = '';
  for (const [metric, timestamp, metricType, name, unit, tags] of metricBucketItems) {
    const maybeTags = Object.keys(tags).length
      ? `|#${Object.entries(tags)
          .map(([key, value]) => `${key}:${String(value)}`)
          .join(',')}`
      : '';
    out += `${name}@${unit}:${metric}|${metricType}${maybeTags}|T${timestamp}\n`;
  }
  return out;
}
