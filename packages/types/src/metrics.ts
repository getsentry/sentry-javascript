import type { MeasurementUnit } from './measurement';
import type { Primitive } from './misc';

export interface BaseMetric {
  name: string;
  timestamp: number;
  unit?: MeasurementUnit;
  tags?: { [key: string]: Primitive };
}

export interface CounterMetric extends BaseMetric {
  value: number;
}

export interface GaugeMetric extends BaseMetric {
  value: number;
  first: number;
  last: number;
  min: number;
  max: number;
  sum: number;
  count: number;
}

export interface DistributionMetric extends BaseMetric {
  value: number[];
}

export interface SetMetric extends BaseMetric {
  value: Set<number>;
}

export type Metric = CounterMetric | GaugeMetric | DistributionMetric | SetMetric;
