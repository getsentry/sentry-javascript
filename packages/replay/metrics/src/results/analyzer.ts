import { filesize } from 'filesize';

import { GitHash } from '../util/git.js';
import { MetricsStats } from './metrics-stats.js';
import { Result } from './result.js';
import { ResultsSet } from './results-set.js';

// Compares latest result to previous/baseline results and produces the needed info.
export class ResultsAnalyzer {
  private constructor(private _result: Result) { }

  public static async analyze(currentResult: Result, baselineResults?: ResultsSet): Promise<Analysis> {
    const items = new ResultsAnalyzer(currentResult)._collect();

    const baseline = baselineResults?.find(
      (other) => other.cpuThrottling == currentResult.cpuThrottling &&
        other.name == currentResult.name &&
        other.networkConditions == currentResult.networkConditions);

    let otherHash: GitHash | undefined
    if (baseline != undefined) {
      const baseItems = new ResultsAnalyzer(baseline[1])._collect();
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

  private _collect(): AnalyzerItem[] {
    const items = new Array<AnalyzerItem>();

    const aStats = new MetricsStats(this._result.aResults);
    const bStats = new MetricsStats(this._result.bResults);

    const pushIfDefined = function (metric: AnalyzerItemMetric, unit: AnalyzerItemUnit, valueA?: number, valueB?: number): void {
      if (valueA == undefined || valueB == undefined) return;
      items.push({ metric: metric, value: new AnalyzerItemNumberValue(unit, valueA, valueB) })
    }

    pushIfDefined(AnalyzerItemMetric.lcp, AnalyzerItemUnit.ms, aStats.lcp, bStats.lcp);
    pushIfDefined(AnalyzerItemMetric.cls, AnalyzerItemUnit.ms, aStats.cls, bStats.cls);
    pushIfDefined(AnalyzerItemMetric.cpu, AnalyzerItemUnit.ratio, aStats.cpu, bStats.cpu);
    pushIfDefined(AnalyzerItemMetric.memoryAvg, AnalyzerItemUnit.bytes, aStats.memoryMean, bStats.memoryMean);
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
  readonly a: string;
  readonly b: string;
  readonly diff: string;
}

class AnalyzerItemNumberValue implements AnalyzerItemValue {
  constructor(private _unit: AnalyzerItemUnit, private _a: number, private _b: number) { }

  public get a(): string {
    return this._withUnit(this._a);
  }

  public get b(): string {
    return this._withUnit(this._b);
  }

  public get diff(): string {
    const diff = this._b - this._a;
    const str = this._withUnit(diff);
    return diff > 0 ? `+${str}` : str;
  }

  private _withUnit(value: number): string {
    switch (this._unit) {
      case AnalyzerItemUnit.bytes:
        return filesize(value) as string;
      case AnalyzerItemUnit.ratio:
        return `${(value * 100).toFixed(2)} %`;
      default:
        return `${value.toFixed(2)} ${AnalyzerItemUnit[this._unit]}`;
    }
  }
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
