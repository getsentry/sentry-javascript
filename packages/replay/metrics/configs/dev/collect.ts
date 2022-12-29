import { Metrics, MetricsCollector } from '../../src/collector.js';
import { JankTestScenario, LoadPageScenario } from '../../src/scenarios.js';
import { latestResultFile } from './env.js';

const collector = new MetricsCollector();
const result = await collector.execute({
  name: 'dummy',
  a: new JankTestScenario(),
  b: new LoadPageScenario('https://developers.google.com/web/'),
  runs: 1,
  tries: 1,
  async test(_aResults: Metrics[], _bResults: Metrics[]) {
    return true;
  },
});

result.writeToFile(latestResultFile);
