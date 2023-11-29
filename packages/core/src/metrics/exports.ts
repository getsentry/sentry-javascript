import type { CounterMetric, DistributionMetric, GaugeMetric, SetMetric } from '@sentry/types';

import { timestampInSeconds } from '@sentry/utils';
import type { MetricData } from './types';

/**
 * Increment a counter by a specified value.
 *
 * @experimental This function may experience breaking changes.
 */
export function increment(name: string, value: number, data: MetricData): void {
  // TODO: Implement
  const _metric: CounterMetric = {
    name,
    timestamp: timestampInSeconds(),
    value,
    ...data,
  };

  // @ts-expect-error TODO: Implement
  return _metric;
}

/**
 * Add to distribution by a specified value.
 *
 * @experimental This function may experience breaking changes.
 */
export function distribution(name: string, value: number, data: MetricData): void {
  const _metric: DistributionMetric = {
    name,
    timestamp: timestampInSeconds(),
    value: [value],
    ...data,
  };

  // @ts-expect-error TODO: Implement
  return _metric;
}

/**
 * Add to set by a specified value.
 *
 * @experimental This function may experience breaking changes.
 */
export function set(name: string, value: number, data: MetricData): void {
  const _metric: SetMetric = {
    name,
    timestamp: timestampInSeconds(),
    value: new Set([value]),
    ...data,
  };

  // @ts-expect-error TODO: Implement
  return _metric;
}

/**
 * Set a gauge by a specified value.
 *
 * @experimental This function may experience breaking changes.
 */
export function gauge(name: string, value: number, data: MetricData): void {
  const _metric: GaugeMetric = {
    name,
    timestamp: timestampInSeconds(),
    value,
    first: value,
    min: value,
    max: value,
    sum: value,
    count: 1,
    ...data,
  };

  // @ts-expect-error TODO: Implement
  return _metric;
}
