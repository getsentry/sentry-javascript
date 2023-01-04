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
    const numbers = this._items.map(dataProvider);
    return numbers.length > 0 ? ss.mean(numbers) : undefined;
  }

  public max(dataProvider: NumberProvider): number | undefined {
    const numbers = this._items.map(dataProvider);
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  }

  public stddev(dataProvider: NumberProvider): number | undefined {
    const numbers = this._items.map(dataProvider);
    return numbers.length > 0 ? ss.standardDeviation(numbers) : undefined;
  }
}
