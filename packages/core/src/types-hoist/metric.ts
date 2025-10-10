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

export type SerializedMetricAttributeValue =
  | { value: string; type: 'string' }
  | { value: number; type: 'integer' }
  | { value: number; type: 'double' }
  | { value: boolean; type: 'boolean' };

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
  attributes?: Record<string, SerializedMetricAttributeValue>;
}

export type SerializedMetricContainer = {
  items: Array<SerializedMetric>;
};
