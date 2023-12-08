interface MetricInstance {
  add(value: number): void;
  toString(): string;
}

/**
 * A metric instance representing a counter.
 */
export class CounterMetric implements MetricInstance {
  public constructor(public value: number) {}

  /** JSDoc */
  public add(value: number): void {
    this.value += value;
  }

  /** JSDoc */
  public toString(): string {
    return `${this.value}`;
  }
}

/**
 * A metric instance representing a gauge.
 */
export class GaugeMetric implements MetricInstance {
  public last: number;
  public min: number;
  public max: number;
  public sum: number;
  public count: number;

  public constructor(public value: number) {
    this.last = value;
    this.min = value;
    this.max = value;
    this.sum = value;
    this.count = 1;
  }

  /** JSDoc */
  public add(value: number): void {
    this.value = value;
    this.last = value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    this.sum += value;
    this.count += 1;
  }

  /** JSDoc */
  public toString(): string {
    return `${this.last}:${this.min}:${this.max}:${this.sum}:${this.count}`;
  }
}

/**
 * A metric instance representing a distribution.
 */
export class DistributionMetric implements MetricInstance {
  public value: number[];

  public constructor(first: number) {
    this.value = [first];
  }

  /** JSDoc */
  public add(value: number): void {
    this.value.push(value);
  }

  /** JSDoc */
  public toString(): string {
    return this.value.join(':');
  }
}

/**
 * A metric instance representing a set.
 */
export class SetMetric implements MetricInstance {
  public value: Set<number>;

  public constructor(public first: number) {
    this.value = new Set([first]);
  }

  /** JSDoc */
  public add(value: number): void {
    this.value.add(value);
  }

  /** JSDoc */
  public toString(): string {
    return `${Array.from(this.value).join(':')}`;
  }
}

export type Metric = CounterMetric | GaugeMetric | DistributionMetric | SetMetric;

export const METRIC_MAP = {
  c: CounterMetric,
  g: GaugeMetric,
  d: DistributionMetric,
  s: SetMetric,
};
