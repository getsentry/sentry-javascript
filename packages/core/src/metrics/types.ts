import type { MetricBucketItem } from '@sentry/types';
import type { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';

export type MetricType =
  | typeof COUNTER_METRIC_TYPE
  | typeof GAUGE_METRIC_TYPE
  | typeof SET_METRIC_TYPE
  | typeof DISTRIBUTION_METRIC_TYPE;

// TODO(@anonrig): Convert this to WeakMap when we support ES6 and
// use FinalizationRegistry to flush the buckets when the aggregator is garbage collected.
export type MetricBucket = Map<string, MetricBucketItem>;
