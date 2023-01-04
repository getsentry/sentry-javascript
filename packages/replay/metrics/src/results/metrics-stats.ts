import * as ss from 'simple-statistics'

import { Metrics } from '../collector';

export type NumberProvider = (metrics: Metrics) => number;

export class MetricsStats {
  constructor(private _items: Metrics[]) { }

  public filteredMean(dataProvider: NumberProvider): number | undefined {
    const numbers = this._items.map(dataProvider);
    return numbers.length > 0 ? ss.mean(numbers) : undefined;
  }

  public get lcp(): number | undefined {
    return this.filteredMean((metrics) => metrics.vitals.lcp);
  }

  public get cls(): number | undefined {
    return this.filteredMean((metrics) => metrics.vitals.cls);
  }

  public get cpu(): number | undefined {
    return this.filteredMean((metrics) => metrics.cpu.average);
  }

  public get memoryAvg(): number | undefined {
    return this.filteredMean((metrics) => ss.mean(Array.from(metrics.memory.snapshots.values())));
  }

  public get memoryMax(): number | undefined {
    const numbers = this._items.map((metrics) => ss.max(Array.from(metrics.memory.snapshots.values())));
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  }
}
