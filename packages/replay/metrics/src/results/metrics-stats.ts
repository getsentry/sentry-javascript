import * as ss from 'simple-statistics'

import { Metrics } from '../collector';

export type NumberProvider = (metrics: Metrics) => number;

export class MetricsStats {
  constructor(private _items: Metrics[]) { }

  static lcp: NumberProvider = metrics => metrics.vitals.lcp;
  static cls: NumberProvider = metrics => metrics.vitals.cls;
  static cpu: NumberProvider = metrics => metrics.cpu.average;
  static memoryMean: NumberProvider = metrics => ss.mean(Array.from(metrics.memory.snapshots.values()));
  static memoryMax: NumberProvider = metrics => ss.max(Array.from(metrics.memory.snapshots.values()));

  public mean(dataProvider: NumberProvider): number | undefined {
    const numbers = this._filteredValues(dataProvider);
    return numbers.length > 0 ? ss.mean(numbers) : undefined;
  }

  public max(dataProvider: NumberProvider): number | undefined {
    const numbers = this._filteredValues(dataProvider);
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  }

  public stddev(dataProvider: NumberProvider): number | undefined {
    const numbers = this._filteredValues(dataProvider);
    return numbers.length > 0 ? ss.standardDeviation(numbers) : undefined;
  }

  // See https://en.wikipedia.org/wiki/Interquartile_range#Outliers for details on filtering.
  private _filteredValues(dataProvider: NumberProvider): number[] {
    const numbers = this._items.map(dataProvider);
    numbers.sort((a, b) => a - b)

    const q1 = ss.quantileSorted(numbers, 0.25);
    const q3 = ss.quantileSorted(numbers, 0.75);
    const iqr = q3 - q1

    return numbers.filter(num => num >= (q1 - 1.5 * iqr) && num <= (q3 + 1.5 * iqr))
  }
}
