import { filesize } from 'filesize';

import type { Metrics } from '../collector.js';
import type { Analysis } from '../results/analyzer.js';
import { AnalyzerItemMetric } from '../results/analyzer.js';
import { MetricsStats } from '../results/metrics-stats.js';

export async function consoleGroup<T>(code: () => Promise<T>): Promise<T> {
  console.group();
  return code().finally(console.groupEnd);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrintableTable = { [k: string]: any };

export function printStats(items: Metrics[]): void {
  console.table({
    lcp: `${MetricsStats.mean(items, MetricsStats.lcp)?.toFixed(2)} ms`,
    cls: `${MetricsStats.mean(items, MetricsStats.cls)?.toFixed(2)} ms`,
    cpu: `${((MetricsStats.mean(items, MetricsStats.cpu) || 0) * 100).toFixed(2)} %`,
    memoryMean: filesize(MetricsStats.mean(items, MetricsStats.memoryMean)),
    memoryMax: filesize(MetricsStats.max(items, MetricsStats.memoryMax)),
    netTx: filesize(MetricsStats.mean(items, MetricsStats.netTx)),
    netRx: filesize(MetricsStats.mean(items, MetricsStats.netRx)),
    netCount: MetricsStats.mean(items, MetricsStats.netCount),
    netTime: `${MetricsStats.mean(items, MetricsStats.netTime)?.toFixed(2)} ms`,
  });
}

export function printAnalysis(analysis: Analysis): void {
  const table: PrintableTable = {};
  for (const item of analysis.items) {
    table[AnalyzerItemMetric[item.metric]] = {
      value: item.values.value(0),
      withSentry: item.values.diff(0, 1),
      withReplay: item.values.diff(0, 2),
      ...(item.others == undefined
        ? {}
        : {
            previous: item.others.value(0),
            previousWithSentry: item.others.diff(0, 1),
            previousWithReplay: item.others.diff(0, 2),
          }),
    };
  }
  console.table(table);
}
