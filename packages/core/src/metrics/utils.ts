import type { MeasurementUnit, MetricBucketItem, Primitive } from '@sentry/types';
import { dropUndefinedKeys } from '../utils-hoist/object';
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
 * Sanitizes units
 *
 * These Regex's are straight from the normalisation docs:
 * https://develop.sentry.dev/sdk/metrics/#normalization
 */
export function sanitizeUnit(unit: string): string {
  return unit.replace(/[^\w]+/gi, '_');
}

/**
 * Sanitizes metric keys
 *
 * These Regex's are straight from the normalisation docs:
 * https://develop.sentry.dev/sdk/metrics/#normalization
 */
export function sanitizeMetricKey(key: string): string {
  return key.replace(/[^\w\-.]+/gi, '_');
}

/**
 * Sanitizes metric keys
 *
 * These Regex's are straight from the normalisation docs:
 * https://develop.sentry.dev/sdk/metrics/#normalization
 */
function sanitizeTagKey(key: string): string {
  return key.replace(/[^\w\-./]+/gi, '');
}

/**
 * These Regex's are straight from the normalisation docs:
 * https://develop.sentry.dev/sdk/metrics/#normalization
 */
const tagValueReplacements: [string, string][] = [
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\t', '\\t'],
  ['\\', '\\\\'],
  ['|', '\\u{7c}'],
  [',', '\\u{2c}'],
];

function getCharOrReplacement(input: string): string {
  for (const [search, replacement] of tagValueReplacements) {
    if (input === search) {
      return replacement;
    }
  }

  return input;
}

function sanitizeTagValue(value: string): string {
  return [...value].reduce((acc, char) => acc + getCharOrReplacement(char), '');
}

/**
 * Sanitizes tags.
 */
export function sanitizeTags(unsanitizedTags: Record<string, Primitive>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const key in unsanitizedTags) {
    if (Object.prototype.hasOwnProperty.call(unsanitizedTags, key)) {
      const sanitizedKey = sanitizeTagKey(key);
      tags[sanitizedKey] = sanitizeTagValue(String(unsanitizedTags[key]));
    }
  }
  return tags;
}
