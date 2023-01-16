import * as ss from 'simple-statistics'

import { Metrics } from '../collector';

export type NumberProvider = (metrics: Metrics) => number | undefined;
export type AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => number | undefined;

export class MetricsStats {
  static lcp: NumberProvider = metrics => metrics.vitals.lcp;
  static cls: NumberProvider = metrics => metrics.vitals.cls;
  static cpu: NumberProvider = metrics => metrics.cpu.average;
  static memoryMean: NumberProvider = metrics => ss.mean(Array.from(metrics.memory.snapshots.values()));
  static memoryMax: NumberProvider = metrics => ss.max(Array.from(metrics.memory.snapshots.values()));

  static mean: AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => {
    const numbers = MetricsStats._filteredValues(MetricsStats._collect(items, dataProvider));
    return numbers.length > 0 ? ss.mean(numbers) : undefined;
  }

  static max: AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => {
    const numbers = MetricsStats._filteredValues(MetricsStats._collect(items, dataProvider));
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  }

  static stddev: AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => {
    const numbers = MetricsStats._filteredValues(MetricsStats._collect(items, dataProvider));
    return numbers.length > 0 ? ss.standardDeviation(numbers) : undefined;
  }

  private static _collect(items: Metrics[], dataProvider: NumberProvider): number[] {
    return items.map(dataProvider).filter(v => v != undefined && !Number.isNaN(v)) as number[];
  }

  // See https://en.wikipedia.org/wiki/Interquartile_range#Outliers for details on filtering.
  private static _filteredValues(numbers: number[]): number[] {
    numbers.sort((a, b) => a - b)

    const q1 = ss.quantileSorted(numbers, 0.25);
    const q3 = ss.quantileSorted(numbers, 0.75);
    const iqr = q3 - q1

    return numbers.filter(num => num >= (q1 - 1.5 * iqr) && num <= (q3 + 1.5 * iqr))
  }
}
