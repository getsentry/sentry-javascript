import type { MeasurementUnit, Primitive } from '@sentry/types';
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
