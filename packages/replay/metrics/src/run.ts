import { MetricsCollector } from './collector.js';
import { LoadPageScenario } from './scenarios.js';

void (async () => {
  const collector = new MetricsCollector();
  const metrics = await collector.run(new LoadPageScenario('https://developers.google.com/web/'));
  console.log(metrics);
})();
