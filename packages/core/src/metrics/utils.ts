import type { MeasurementUnit } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import type { MetricType } from './types';

/**
 * Generate bucket key from metric properties.
 */
export function getBucketKey(
  metricType: MetricType,
  name: string,
  unit: MeasurementUnit,
  tags: { [key: string]: string },
): string {
  const stringifiedTags = Object.entries(dropUndefinedKeys(tags)).sort() as unknown as string[];
  return [metricType, name, unit].concat(stringifiedTags).join('');
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
