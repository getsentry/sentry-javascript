import * as puppeteer from 'puppeteer';

import { WebVitals, WebVitalsCollector } from './vitals/index.js';

const cpuThrottling = 4;
const networkConditions = puppeteer.PredefinedNetworkConditions['Fast 3G'];

class Metrics {
  constructor(
      public url: string, public pageMetrics: puppeteer.Metrics,
      public vitals: WebVitals) {}
}

class MetricsCollector {
  constructor(public url: string) {}

  public async run(): Promise<Metrics> {
    const browser = await puppeteer.launch({headless: false,});
    try {
      const page = await browser.newPage();

      const vitalsCollector = new WebVitalsCollector(page);
      await vitalsCollector.setup();

      // Simulated throttling
      await page.emulateNetworkConditions(networkConditions);
      await page.emulateCPUThrottling(cpuThrottling);

      await page.goto(this.url, { waitUntil: 'load', timeout: 60000 });

      const pageMetrics = await page.metrics();
      const vitals = await vitalsCollector.collect();

      return new Metrics(this.url, pageMetrics, vitals);
    } finally {
      await browser.close();
    }
  }
}

void (async () => {
  const collector = new MetricsCollector('https://developers.google.com/web/');
  const metrics = await collector.run();
  console.log(metrics);
})();
