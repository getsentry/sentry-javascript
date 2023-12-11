import { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';

interface MetricInstance {
  add(value: number): void;
  toString(): string;
}

/**
 * A metric instance representing a counter.
 */
export class CounterMetric implements MetricInstance {
  public constructor(private _value: number) {}

  /** JSDoc */
  public add(value: number): void {
    this._value += value;
  }

  /** JSDoc */
  public toString(): string {
    return `${this._value}`;
  }
}

/**
 * A metric instance representing a gauge.
 */
export class GaugeMetric implements MetricInstance {
  private _last: number;
  private _min: number;
  private _max: number;
  private _sum: number;
  private _count: number;

  public constructor(private _value: number) {
    this._last = _value;
    this._min = _value;
    this._max = _value;
    this._sum = _value;
    this._count = 1;
  }

  /** JSDoc */
  public add(value: number): void {
    this._value = value;
    this._value = value;
    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);
    this._sum += value;
    this._count += 1;
  }

  /** JSDoc */
  public toString(): string {
    return `${this._last}:${this._min}:${this._max}:${this._sum}:${this._count}`;
  }
}

/**
 * A metric instance representing a distribution.
 */
export class DistributionMetric implements MetricInstance {
  private _value: number[];

  public constructor(first: number) {
    this._value = [first];
  }

  /** JSDoc */
  public add(value: number): void {
    this._value.push(value);
  }

  /** JSDoc */
  public toString(): string {
    return this._value.join(':');
  }
}

/**
 * A metric instance representing a set.
 */
export class SetMetric implements MetricInstance {
  private _value: Set<number>;

  public constructor(public first: number) {
    this._value = new Set([first]);
  }

  /** JSDoc */
  public add(value: number): void {
    this._value.add(value);
  }

  /** JSDoc */
  public toString(): string {
    return `${Array.from(this._value).join(':')}`;
  }
}

export type Metric = CounterMetric | GaugeMetric | DistributionMetric | SetMetric;

export const METRIC_MAP = {
  [COUNTER_METRIC_TYPE]: CounterMetric,
  [GAUGE_METRIC_TYPE]: GaugeMetric,
  [DISTRIBUTION_METRIC_TYPE]: DistributionMetric,
  [SET_METRIC_TYPE]: SetMetric,
};
