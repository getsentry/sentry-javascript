import { GitHash } from '../util/git.js';
import { Result } from './result.js';
import { ResultsSet } from './results-set.js';
import { MetricsStats } from './metrics-stats.js';
import { filesize } from "filesize";

// Compares latest result to previous/baseline results and produces the needed info.
export class ResultsAnalyzer {
  public static async analyze(currentResult: Result, baselineResults?: ResultsSet): Promise<Analysis> {
    const items = new ResultsAnalyzer(currentResult).collect();

    const baseline = baselineResults?.find(
      (other) => other.cpuThrottling == currentResult.cpuThrottling &&
        other.name == currentResult.name &&
        other.networkConditions == currentResult.networkConditions);

    let otherHash: GitHash | undefined
    if (baseline != undefined) {
      const baseItems = new ResultsAnalyzer(baseline[1]).collect();
      // update items with baseline results
      for (const base of baseItems) {
        for (const item of items) {
          if (item.metric == base.metric) {
            item.other = base.value;
            otherHash = baseline[0];
          }
        }
      }
    }

    return {
      items: items,
      otherHash: otherHash,
    };
  }

  private constructor(private result: Result) { }

  private collect(): AnalyzerItem[] {
    const items = new Array<AnalyzerItem>();

    const aStats = new MetricsStats(this.result.aResults);
    const bStats = new MetricsStats(this.result.bResults);

    const pushIfDefined = function (metric: AnalyzerItemMetric, unit: AnalyzerItemUnit, valueA?: number, valueB?: number) {
      if (valueA == undefined || valueB == undefined) return;

      items.push({
        metric: metric,
        value: {
          unit: unit,
          asDiff: () => valueB - valueA,
          asRatio: () => valueB / valueA,
          asString: () => {
            const diff = valueB - valueA;
            const prefix = diff >= 0 ? '+' : '';

            switch (unit) {
              case AnalyzerItemUnit.bytes:
                return prefix + filesize(diff);
              case AnalyzerItemUnit.ratio:
                return prefix + (diff * 100).toFixed(2) + ' %';
              default:
                return prefix + diff.toFixed(2) + ' ' + AnalyzerItemUnit[unit];
            }
          }
        }
      })
    }

    pushIfDefined(AnalyzerItemMetric.lcp, AnalyzerItemUnit.ms, aStats.lcp, bStats.lcp);
    pushIfDefined(AnalyzerItemMetric.cls, AnalyzerItemUnit.ms, aStats.cls, bStats.cls);
    pushIfDefined(AnalyzerItemMetric.cpu, AnalyzerItemUnit.ratio, aStats.cpu, bStats.cpu);
    pushIfDefined(AnalyzerItemMetric.memoryAvg, AnalyzerItemUnit.bytes, aStats.memoryAvg, bStats.memoryAvg);
    pushIfDefined(AnalyzerItemMetric.memoryMax, AnalyzerItemUnit.bytes, aStats.memoryMax, bStats.memoryMax);

    return items.filter((item) => item.value != undefined);
  }
}

export enum AnalyzerItemUnit {
  ms,
  ratio, // 1.0 == 100 %
  bytes,
}

export interface AnalyzerItemValue {
  unit: AnalyzerItemUnit;
  asString(): string;
  asDiff(): number;
  asRatio(): number; // 1.0 == 100 %
}

export enum AnalyzerItemMetric {
  lcp,
  cls,
  cpu,
  memoryAvg,
  memoryMax,
}

export interface AnalyzerItem {
  metric: AnalyzerItemMetric;

  // Current (latest) result.
  value: AnalyzerItemValue;

  // Previous or baseline results, depending on the context.
  other?: AnalyzerItemValue;
}

export interface Analysis {
  items: AnalyzerItem[];

  // Commit hash that the the previous or baseline (depending on the context) result was collected for.
  otherHash?: GitHash;
}
