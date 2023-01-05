import { Metrics, MetricsCollector } from '../../src/collector.js';
import { MetricsStats, NumberProvider } from '../../src/results/metrics-stats.js';
import { JankTestScenario } from '../../src/scenarios.js';
import { printStats } from '../../src/util/console.js';
import { latestResultFile } from './env.js';

function checkStdDev(stats: MetricsStats, name: string, provider: NumberProvider, max: number): boolean {
  const value = stats.stddev(provider);
  if (value == undefined) {
    console.warn(`✗ | Discarding results because StandardDeviation(${name}) is undefined`);
    return false;
  } else if (value > max) {
    console.warn(`✗ | Discarding results because StandardDeviation(${name}) is larger than ${max}. Actual value: ${value}`);
    return false;
  } else {
    console.log(`✓ | StandardDeviation(${name}) is ${value} (<= ${max})`)
  }
  return true;
}

const collector = new MetricsCollector({ headless: true });
const result = await collector.execute({
  name: 'jank',
  a: new JankTestScenario(false),
  b: new JankTestScenario(true),
  runs: 10,
  tries: 10,
  async shouldAccept(results: Metrics[]): Promise<boolean> {
    const stats = new MetricsStats(results);
    printStats(stats);

    if (!checkStdDev(stats, 'lcp', MetricsStats.lcp, 30)
      || !checkStdDev(stats, 'cls', MetricsStats.cls, 0.1)
      || !checkStdDev(stats, 'cpu', MetricsStats.cpu, 1)
      || !checkStdDev(stats, 'memory-mean', MetricsStats.memoryMean, 1000 * 1024)
      || !checkStdDev(stats, 'memory-max', MetricsStats.memoryMax, 1000 * 1024)) {
      return false;
    }

    const cpuUsage = stats.mean(MetricsStats.cpu)!;
    if (cpuUsage > 0.85) {
      console.warn(`✗ | Discarding results because CPU usage is too high and may be inaccurate: ${(cpuUsage * 100).toFixed(2)} %.`,
        'Consider simplifying the scenario or changing the CPU throttling factor.');
      return false;
    }

    return true;
  },
});

result.writeToFile(latestResultFile);
