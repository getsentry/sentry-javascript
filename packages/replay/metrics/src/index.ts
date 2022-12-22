import * as puppeteer from 'puppeteer';

import {CpuUsage} from './perf/cpu.js';
import {JsHeapUsage} from './perf/memory.js';
import {PerfMetricsSampler} from './perf/sampler.js';
import {WebVitals, WebVitalsCollector} from './vitals/index.js';

const cpuThrottling = 4;
const networkConditions = puppeteer.PredefinedNetworkConditions['Fast 3G'];

class Metrics {
  constructor(public url: string, public vitals: WebVitals,
              public cpu: CpuUsage, public memory: JsHeapUsage) {}
}

class MetricsCollector {
  constructor(public url: string) {}

  public async run(): Promise<Metrics> {
    const disposeCallbacks: (() => Promise<void>)[] = [];
    try {
      const browser = await puppeteer.launch({
        headless : false,
      });
      disposeCallbacks.push(async () => browser.close());
      const page = await browser.newPage();

      // Simulated throttling
      await page.emulateNetworkConditions(networkConditions);
      await page.emulateCPUThrottling(cpuThrottling);

      const perfSampler = await PerfMetricsSampler.create(
          page, 100); // collect 10 times per second
      disposeCallbacks.push(async () => perfSampler.stop());
      const cpu = new CpuUsage(perfSampler);
      const jsHeap = new JsHeapUsage(perfSampler);

      const vitalsCollector = await WebVitalsCollector.create(page);

      await page.goto(this.url, {waitUntil : 'load', timeout : 60000});

      // TODO FID needs some interaction to actually show a value
      const vitals = await vitalsCollector.collect();

      return new Metrics(this.url, vitals, cpu, jsHeap);
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
