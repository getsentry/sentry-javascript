import { Metrics, MetricsCollector } from '../../src/collector.js';
import { MetricsStats } from '../../src/results/metrics-stats.js';
import { JankTestScenario } from '../../src/scenarios.js';
import { printStats } from '../../src/util/console.js';
import { latestResultFile } from './env.js';

const collector = new MetricsCollector();
const result = await collector.execute({
  name: 'dummy',
  a: new JankTestScenario(false),
  b: new JankTestScenario(true),
  runs: 1,
  tries: 1,
  async shouldAccept(results: Metrics[]): Promise<boolean> {
    const stats = new MetricsStats(results);
    printStats(stats);

    const cpuUsage = stats.mean(MetricsStats.cpu)!;
    if (cpuUsage > 0.9) {
      console.error(`CPU usage too high to be accurate: ${(cpuUsage * 100).toFixed(2)} %.`,
        'Consider simplifying the scenario or changing the CPU throttling factor.');
      return false;
    }
    return true;
  },
});

result.writeToFile(latestResultFile);
