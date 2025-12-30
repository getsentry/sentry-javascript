import type { Attributes } from '../attributes';

export type MetricType = 'counter' | 'gauge' | 'distribution';

export interface Metric {
  /**
   * The name of the metric.
   */
  name: string;

  /**
   * The value of the metric.
   */
  value: number;

  /**
   * The type of metric.
   */
  type: MetricType;

  /**
   * The unit of the metric value.
   */
  unit?: string;

  /**
   * Arbitrary structured data that stores information about the metric.
   */
  attributes?: Record<string, unknown>;
}

/**
 * @deprecated This type was not intended for public export and you shouldn't depend on it.
 * If you absolutely need to use it, use `SerializedMetricAttributeValue['attributes'] instead.
 */
export type SerializedMetricAttributeValue = Attributes;

export interface SerializedMetric {
  /**
   * Timestamp in seconds (epoch time) indicating when the metric was recorded.
   */
  timestamp: number;

  /**
   * The trace ID for this metric.
   */
  trace_id: string;

  /**
   * The span ID for this metric.
   */
  span_id?: string;

  /**
   * The name of the metric.
   */
  name: string;

  /**
   * The type of metric.
   */
  type: MetricType;

  /**
   * The unit of the metric value.
   */
  unit?: string;

  /**
   * The value of the metric.
   */
  value: number;

  /**
   * Arbitrary structured data that stores information about the metric.
   */
  attributes?: Attributes;
}

export type SerializedMetricContainer = {
  items: Array<SerializedMetric>;
};
