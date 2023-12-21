import type { MetricInstance } from '@sentry/types';
import { COUNTER_METRIC_TYPE, DISTRIBUTION_METRIC_TYPE, GAUGE_METRIC_TYPE, SET_METRIC_TYPE } from './constants';
import { simpleHash } from './utils';

/**
 * A metric instance representing a counter.
 */
export class CounterMetric implements MetricInstance {
  public constructor(private _value: number) {}

  /** @inheritDoc */
  public get weight(): number {
    return 1;
  }

  /** @inheritdoc */
  public add(value: number): void {
    this._value += value;
  }

  /** @inheritdoc */
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

  public constructor(value: number) {
    this._last = value;
    this._min = value;
    this._max = value;
    this._sum = value;
    this._count = 1;
  }

  /** @inheritDoc */
  public get weight(): number {
    return 5;
  }

  /** @inheritdoc */
  public add(value: number): void {
    this._last = value;
    if (value < this._min) {
      this._min = value;
    }
    if (value > this._max) {
      this._max = value;
    }
    this._sum += value;
    this._count++;
  }

  /** @inheritdoc */
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

  /** @inheritDoc */
  public get weight(): number {
    return this._value.length;
  }

  /** @inheritdoc */
  public add(value: number): void {
    this._value.push(value);
  }

  /** @inheritdoc */
  public toString(): string {
    return this._value.join(':');
  }
}

/**
 * A metric instance representing a set.
 */
export class SetMetric implements MetricInstance {
  private _value: Set<number | string>;

  public constructor(public first: number | string) {
    this._value = new Set([first]);
  }

  /** @inheritDoc */
  public get weight(): number {
    return this._value.size;
  }

  /** @inheritdoc */
  public add(value: number | string): void {
    this._value.add(value);
  }

  /** @inheritdoc */
  public toString(): string {
    return Array.from(this._value)
      .map(val => (typeof val === 'string' ? simpleHash(val) : val))
      .join(':');
  }
}

export const METRIC_MAP = {
  [COUNTER_METRIC_TYPE]: CounterMetric,
  [GAUGE_METRIC_TYPE]: GaugeMetric,
  [DISTRIBUTION_METRIC_TYPE]: DistributionMetric,
  [SET_METRIC_TYPE]: SetMetric,
};
