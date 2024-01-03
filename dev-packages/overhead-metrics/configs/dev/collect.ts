import type { Metrics } from '../../src/collector.js';
import { MetricsCollector } from '../../src/collector.js';
import { MetricsStats } from '../../src/results/metrics-stats.js';
import { BookingAppScenario } from '../../src/scenarios.js';
import { printStats } from '../../src/util/console.js';
import { latestResultFile } from './env.js';

const collector = new MetricsCollector();
const result = await collector.execute({
  name: 'dummy',
  scenarios: [
    new BookingAppScenario('index.html', 50),
    new BookingAppScenario('with-sentry.html', 50),
    new BookingAppScenario('with-replay.html', 50),
    new BookingAppScenario('index.html', 500),
    new BookingAppScenario('with-sentry.html', 500),
    new BookingAppScenario('with-replay.html', 500),
  ],
  runs: 1,
  tries: 1,
  async shouldAccept(results: Metrics[]): Promise<boolean> {
    printStats(results);

    const cpuUsage = MetricsStats.mean(results, MetricsStats.cpu)!;
    if (cpuUsage > 0.9) {
      console.error(
        `CPU usage too high to be accurate: ${(cpuUsage * 100).toFixed(2)} %.`,
        'Consider simplifying the scenario or changing the CPU throttling factor.',
      );
      return false;
    }
    return true;
  },
});

result.writeToFile(latestResultFile);
