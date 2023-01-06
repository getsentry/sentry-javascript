import { filesize } from 'filesize';

import { Analysis, AnalyzerItemMetric } from '../results/analyzer.js';
import { MetricsStats } from '../results/metrics-stats.js';

export async function consoleGroup<T>(code: () => Promise<T>): Promise<T> {
  console.group();
  return code().finally(console.groupEnd);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrintableTable = { [k: string]: any };

export function printStats(stats: MetricsStats): void {
  console.table({
    lcp: `${stats.mean(MetricsStats.lcp)?.toFixed(2)} ms`,
    cls: `${stats.mean(MetricsStats.cls)?.toFixed(2)} ms`,
    cpu: `${((stats.mean(MetricsStats.cpu) || 0) * 100).toFixed(2)} %`,
    memoryMean: filesize(stats.mean(MetricsStats.memoryMean)),
    memoryMax: filesize(stats.max(MetricsStats.memoryMax)),
  });
}

export function printAnalysis(analysis: Analysis): void {
  const table: PrintableTable = {};
  for (const item of analysis.items) {
    table[AnalyzerItemMetric[item.metric]] = {
      value: item.value.diff,
      ...((item.other == undefined) ? {} : {
        previous: item.other.diff
      })
    };
  }
  console.table(table);
}
