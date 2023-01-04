import { Metrics, MetricsCollector } from '../../src/collector.js';
import { JankTestScenario } from '../../src/scenarios.js';
import { latestResultFile } from './env.js';

const collector = new MetricsCollector();
const result = await collector.execute({
  name: 'dummy',
  a: new JankTestScenario(false),
  b: new JankTestScenario(true),
  runs: 1,
  tries: 1,
  async shouldAccept(_results: Metrics[]): Promise<boolean> {
    return true;
  },
});

result.writeToFile(latestResultFile);
