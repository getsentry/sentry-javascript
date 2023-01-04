import * as ss from 'simple-statistics'

import { Metrics } from '../collector';

export type NumberProvider = (metrics: Metrics) => number;

export class MetricsStats {
  constructor(private _items: Metrics[]) { }

  public mean(dataProvider: NumberProvider): number | undefined {
    const numbers = this._items.map(dataProvider);
    return numbers.length > 0 ? ss.mean(numbers) : undefined;
  }

  public get lcp(): number | undefined {
    return this.mean((metrics) => metrics.vitals.lcp);
  }

  public get cls(): number | undefined {
    return this.mean((metrics) => metrics.vitals.cls);
  }

  public get cpu(): number | undefined {
    return this.mean((metrics) => metrics.cpu.average);
  }

  public get memoryMean(): number | undefined {
    return this.mean((metrics) => ss.mean(Array.from(metrics.memory.snapshots.values())));
  }

  public get memoryMax(): number | undefined {
    const numbers = this._items.map((metrics) => ss.max(Array.from(metrics.memory.snapshots.values())));
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  }
}
