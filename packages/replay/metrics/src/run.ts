import { Metrics, MetricsCollector } from './collector.js';
import { LoadPageScenario, TestCase } from './scenarios.js';

const tests: TestCase[] = [
  {
    name: 'dummy',
    a: new LoadPageScenario('https://developers.google.com/web/'),
    b: new LoadPageScenario('https://developers.google.com/'),
    runs: 1,
    tries: 1,
    async test(_aResults: Metrics[], _bResults: Metrics[]) {
      return true;
    },
  }
]

const collector = new MetricsCollector();
for (const testCase of tests) {
  await collector.execute(testCase);
}
