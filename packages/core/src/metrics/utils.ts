import type { MeasurementUnit, MetricBucketItem, Primitive } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { NAME_AND_TAG_KEY_NORMALIZATION_REGEX, TAG_VALUE_NORMALIZATION_REGEX } from './constants';
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
export function serializeMetricBuckets(metricBucketItems: MetricBucketItem[]): string {
  let out = '';
  for (const item of metricBucketItems) {
    const tagEntries = Object.entries(item.tags);
    const maybeTags = tagEntries.length > 0 ? `|#${tagEntries.map(([key, value]) => `${key}:${value}`).join(',')}` : '';
    out += `${item.name}@${item.unit}:${item.metric}|${item.metricType}${maybeTags}|T${item.timestamp}\n`;
  }
  return out;
}

/**
 * Sanitizes tags.
 */
export function sanitizeTags(unsanitizedTags: Record<string, Primitive>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const key in unsanitizedTags) {
    if (Object.prototype.hasOwnProperty.call(unsanitizedTags, key)) {
      const sanitizedKey = key.replace(NAME_AND_TAG_KEY_NORMALIZATION_REGEX, '_');
      tags[sanitizedKey] = String(unsanitizedTags[key]).replace(TAG_VALUE_NORMALIZATION_REGEX, '_');
    }
  }
  return tags;
}
