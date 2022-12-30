import { Metrics } from '../collector';
import * as ss from 'simple-statistics'

export type NumberProvider = (metrics: Metrics) => number;

export class MetricsStats {
  constructor(private items: Metrics[]) { }

  // See https://en.wikipedia.org/wiki/Interquartile_range#Outliers for details
  public filterOutliers(dataProvider: NumberProvider): number[] {
    let numbers = this.items.map(dataProvider);
    // TODO implement, see https://github.com/getsentry/action-app-sdk-overhead-metrics/blob/9ce7d562ff79b317688d22bd5c0bb725cbdfdb81/src/test/kotlin/StartupTimeTest.kt#L27-L37
    return numbers;
  }

  public filteredMean(dataProvider: NumberProvider): number | undefined {
    const numbers = this.filterOutliers(dataProvider);
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
    const numbers = this.filterOutliers((metrics) => ss.max(Array.from(metrics.memory.snapshots.values())));
    return numbers.length > 0 ? ss.max(numbers) : undefined;
  }
}
