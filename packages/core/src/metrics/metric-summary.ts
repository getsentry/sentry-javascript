import type { MeasurementUnit, Span } from '../types-hoist';
import type { MetricSummary } from '../types-hoist';
import type { Primitive } from '../types-hoist';
import { dropUndefinedKeys } from '../utils-hoist/object';
import type { MetricType } from './types';

/**
 * key: bucketKey
 * value: [exportKey, MetricSummary]
 */
type MetricSummaryStorage = Map<string, [string, MetricSummary]>;

const METRICS_SPAN_FIELD = '_sentryMetrics';

type SpanWithPotentialMetrics = Span & {
  [METRICS_SPAN_FIELD]?: MetricSummaryStorage;
};

/**
 * Fetches the metric summary if it exists for the passed span
 */
export function getMetricSummaryJsonForSpan(span: Span): Record<string, Array<MetricSummary>> | undefined {
  const storage = (span as SpanWithPotentialMetrics)[METRICS_SPAN_FIELD];

  if (!storage) {
    return undefined;
  }
  const output: Record<string, Array<MetricSummary>> = {};

  for (const [, [exportKey, summary]] of storage) {
    const arr = output[exportKey] || (output[exportKey] = []);
    arr.push(dropUndefinedKeys(summary));
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
  const existingStorage = (span as SpanWithPotentialMetrics)[METRICS_SPAN_FIELD];
  const storage =
    existingStorage ||
    ((span as SpanWithPotentialMetrics)[METRICS_SPAN_FIELD] = new Map<string, [string, MetricSummary]>());

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
}
