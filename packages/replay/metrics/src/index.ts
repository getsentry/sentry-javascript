import * as puppeteer from 'puppeteer';

import { CpuMonitor, CpuUsageHistory } from './cpu.js';
import { WebVitals, WebVitalsCollector } from './vitals/index.js';

const cpuThrottling = 4;
const networkConditions = puppeteer.PredefinedNetworkConditions['Fast 3G'];

class Metrics {
  constructor(
    public url: string, public pageMetrics: puppeteer.Metrics,
    public vitals: WebVitals, public cpu: CpuUsageHistory) { }
}

class MetricsCollector {
  constructor(public url: string) { }

  public async run(): Promise<Metrics> {
    const disposeCallbacks : (() => Promise<void>)[] = [];
    try {
      const browser = await puppeteer.launch({ headless: false, });
      disposeCallbacks.push(async () => browser.close());
      const page = await browser.newPage();

      // Simulated throttling
      await page.emulateNetworkConditions(networkConditions);
      await page.emulateCPUThrottling(cpuThrottling);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const cdp = await page.target().createCDPSession();

      const vitalsCollector = await WebVitalsCollector.create(page);
      const cpuMonitor = await CpuMonitor.create(cdp, 100); // collect 10 times per second
      disposeCallbacks.push(async () => cpuMonitor.stop());

      await page.goto(this.url, { waitUntil: 'load', timeout: 60000 });

      const pageMetrics = await page.metrics();

      // TODO FID needs some interaction to actually show a value
      const vitals = await vitalsCollector.collect();

      return new Metrics(this.url, pageMetrics, vitals, cpuMonitor.stats());
    } finally {
      disposeCallbacks.reverse().forEach((cb) => cb().catch(console.log));
    }
  }
}

void (async () => {
  const collector = new MetricsCollector('https://developers.google.com/web/');
  const metrics = await collector.run();
  console.log(metrics);
})();
