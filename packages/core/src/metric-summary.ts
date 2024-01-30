import type { MeasurementUnit, Primitive, SpanMetricSummaryAggregator } from '@sentry/types';
import type { MetricSpanSummary } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

/** */
export class MetricSummaryAggregator implements SpanMetricSummaryAggregator {
  private readonly _measurements: Map<string, MetricSpanSummary>;

  public constructor() {
    this._measurements = new Map<string, MetricSpanSummary>();
  }

  /** @inheritdoc */
  public add(
    metricType: 'c' | 'g' | 's' | 'd',
    name: string,
    value: number,
    unit?: MeasurementUnit | undefined,
    tags?: Record<string, Primitive> | undefined,
  ): void {
    const exportKey = `${metricType}:${name}@${unit}`;
    const bucketKey = `${exportKey}\n${JSON.stringify(tags)}`;

    const summary = this._measurements.get(bucketKey);

    if (summary) {
      this._measurements.set(bucketKey, {
        min: Math.min(summary.min, value),
        max: Math.max(summary.max, value),
        count: (summary.count += 1),
        sum: (summary.sum += value),
        tags: summary.tags,
      });
    } else {
      this._measurements.set(bucketKey, {
        min: value,
        max: value,
        count: 1,
        sum: value,
        tags: tags,
      });
    }
  }

  /** @inheritdoc */
  public getSummaryJson(): Record<string, MetricSpanSummary> {
    const output: Record<string, MetricSpanSummary> = {};

    for (const [bucketKey, summary] of this._measurements) {
      const [exportKey] = bucketKey.split('\n');
      output[exportKey] = dropUndefinedKeys(summary);
    }

    return output;
  }
}
