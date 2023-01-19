import { Metrics, MetricsCollector } from '../../src/collector.js';
import { MetricsStats, NumberProvider } from '../../src/results/metrics-stats.js';
import { JankTestScenario } from '../../src/scenarios.js';
import { printStats } from '../../src/util/console.js';
import { latestResultFile } from './env.js';

function checkStdDev(results: Metrics[], name: string, provider: NumberProvider, max: number): boolean {
  const value = MetricsStats.stddev(results, provider);
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

const collector = new MetricsCollector({ headless: true, cpuThrottling: 2 });
const result = await collector.execute({
  name: 'jank',
  scenarios: [
    new JankTestScenario('index.html'),
    new JankTestScenario('with-sentry.html'),
    new JankTestScenario('with-replay.html'),
  ],
  runs: 10,
  tries: 10,
  async shouldAccept(results: Metrics[]): Promise<boolean> {
    await printStats(results);

    if (!checkStdDev(results, 'lcp', MetricsStats.lcp, 50)
      || !checkStdDev(results, 'cls', MetricsStats.cls, 0.1)
      || !checkStdDev(results, 'cpu', MetricsStats.cpu, 1)
      || !checkStdDev(results, 'memory-mean', MetricsStats.memoryMean, 1000 * 1024)
      || !checkStdDev(results, 'memory-max', MetricsStats.memoryMax, 1000 * 1024)) {
      return false;
    }

    const cpuUsage = MetricsStats.mean(results, MetricsStats.cpu)!;
    if (cpuUsage > 0.85) {
      // Note: complexity on the "JankTest" is defined by the `minimum = ...,` setting in app.js - specifying the number of animated elements.
      console.warn(`✗ | Discarding results because CPU usage is too high and may be inaccurate: ${(cpuUsage * 100).toFixed(2)} %.`,
        'Consider simplifying the scenario or changing the CPU throttling factor.');
      return false;
    }

    return true;
  },
});

result.writeToFile(latestResultFile);
