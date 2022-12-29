import { Metrics, MetricsCollector } from '../../src/collector.js';
import { LoadPageScenario } from '../../src/scenarios.js';
import { latestResultFile } from './env.js';

const collector = new MetricsCollector();
const result = await collector.execute({
  name: 'dummy',
  a: new LoadPageScenario('https://developers.google.com/web/'),
  b: new LoadPageScenario('https://developers.google.com/'),
  runs: 1,
  tries: 1,
  async test(_aResults: Metrics[], _bResults: Metrics[]) {
    return true;
  },
});

result.writeToFile(latestResultFile);
