import * as ss from 'simple-statistics';

import type { Metrics } from '../collector';

export type NumberProvider = (metrics: Metrics) => number | undefined;
export type AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => number | undefined;

export class MetricsStats {
  public static lcp: NumberProvider = metrics => metrics.vitals.lcp;
  public static cls: NumberProvider = metrics => metrics.vitals.cls;
  public static cpu: NumberProvider = metrics => metrics.cpu.average;
  public static memoryMean: NumberProvider = metrics => ss.mean(Array.from(metrics.memory.snapshots.values()));
  public static memoryMax: NumberProvider = metrics => ss.max(Array.from(metrics.memory.snapshots.values()));
  public static netTx: NumberProvider = metrics => ss.sum(metrics.network.events.map(e => e.requestSize || 0));
  public static netRx: NumberProvider = metrics => ss.sum(metrics.network.events.map(e => e.responseSize || 0));
  public static netCount: NumberProvider = metrics =>
    ss.sum(metrics.network.events.map(e => (e.requestTimeNs && e.responseTimeNs ? 1 : 0)));
  public static netTime: NumberProvider = metrics =>
    ss.sum(
      metrics.network.events.map(e =>
        e.requestTimeNs && e.responseTimeNs ? Number(e.responseTimeNs - e.requestTimeNs) / 1e6 : 0,
      ),
    );

  public static mean: AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => {
    const numbers = MetricsStats._filteredValues(MetricsStats._collect(items, dataProvider));
    return numbers.length > 0 ? ss.mean(numbers) : undefined;
  };

  public static max: AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => {
    const numbers = MetricsStats._filteredValues(MetricsStats._collect(items, dataProvider));
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  };

  public static stddev: AnalyticsFunction = (items: Metrics[], dataProvider: NumberProvider) => {
    const numbers = MetricsStats._filteredValues(MetricsStats._collect(items, dataProvider));
    return numbers.length > 0 ? ss.standardDeviation(numbers) : undefined;
  };

  /**
   *
   */
  private static _collect(items: Metrics[], dataProvider: NumberProvider): number[] {
    return items.map(dataProvider).filter(v => v != undefined && !Number.isNaN(v)) as number[];
  }

  // See https://en.wikipedia.org/wiki/Interquartile_range#Outliers for details on filtering.
  /**
   *
   */
  private static _filteredValues(numbers: number[]): number[] {
    numbers.sort((a, b) => a - b);

    if (numbers.length < 1) {
      return [];
    }

    const q1 = ss.quantileSorted(numbers, 0.25);
    const q3 = ss.quantileSorted(numbers, 0.75);
    const iqr = q3 - q1;

    return numbers.filter(num => num >= q1 - 1.5 * iqr && num <= q3 + 1.5 * iqr);
  }
}
