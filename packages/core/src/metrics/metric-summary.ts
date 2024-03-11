import type { MeasurementUnit, Span } from '@sentry/types';
import type { MetricSummary } from '@sentry/types';
import type { Primitive } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import type { MetricType } from './types';

/**
 * key: bucketKey
 * value: [exportKey, MetricSummary]
 */
type MetricSummaryStorage = Map<string, [string, MetricSummary]>;

let SPAN_METRIC_SUMMARY: WeakMap<Span, MetricSummaryStorage> | undefined;

function getMetricStorageForSpan(span: Span): MetricSummaryStorage | undefined {
  return SPAN_METRIC_SUMMARY ? SPAN_METRIC_SUMMARY.get(span) : undefined;
}

/**
 * Fetches the metric summary if it exists for the passed span
 */
export function getMetricSummaryJsonForSpan(span: Span): Record<string, Array<MetricSummary>> | undefined {
  const storage = getMetricStorageForSpan(span);

  if (!storage) {
    return undefined;
  }
  const output: Record<string, Array<MetricSummary>> = {};

  for (const [, [exportKey, summary]] of storage) {
    if (!output[exportKey]) {
      output[exportKey] = [];
    }

    output[exportKey].push(dropUndefinedKeys(summary));
  }

  return output;
}

/**
 * Updates the metric summary on a span.
 */
export function updateMetricSummaryOnSpan(
  span: Span,
  metricType: MetricType,
  sanitizedName: string,
  value: number,
  unit: MeasurementUnit,
  tags: Record<string, Primitive>,
  bucketKey: string,
): void {
  const storage = getMetricStorageForSpan(span) || new Map<string, [string, MetricSummary]>();

  const exportKey = `${metricType}:${sanitizedName}@${unit}`;
  const bucketItem = storage.get(bucketKey);

  if (bucketItem) {
    const [, summary] = bucketItem;
    storage.set(bucketKey, [
      exportKey,
      {
        min: Math.min(summary.min, value),
        max: Math.max(summary.max, value),
        count: (summary.count += 1),
        sum: (summary.sum += value),
        tags: summary.tags,
      },
    ]);
  } else {
    storage.set(bucketKey, [
      exportKey,
      {
        min: value,
        max: value,
        count: 1,
        sum: value,
        tags,
      },
    ]);
  }

  if (!SPAN_METRIC_SUMMARY) {
    SPAN_METRIC_SUMMARY = new WeakMap();
  }

  SPAN_METRIC_SUMMARY.set(span, storage);
}
