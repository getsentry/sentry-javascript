import * as puppeteer from 'puppeteer';

import { CpuUsage } from './perf/cpu.js';
import { JsHeapUsage } from './perf/memory.js';
import { PerfMetricsSampler } from './perf/sampler.js';
import { Scenario } from './scenarios.js';
import { WebVitals, WebVitalsCollector } from './vitals/index.js';

const cpuThrottling = 4;
const networkConditions = puppeteer.PredefinedNetworkConditions['Fast 3G'];

class Metrics {
  constructor(public scenario: Scenario, public vitals: WebVitals,
    public cpu: CpuUsage, public memory: JsHeapUsage) { }
}

export class MetricsCollector {
  public async run(scenario: Scenario): Promise<Metrics> {
    const disposeCallbacks: (() => Promise<void>)[] = [];
    try {
      const browser = await puppeteer.launch({
        headless: false,
      });
      disposeCallbacks.push(async () => browser.close());
      const page = await browser.newPage();

      // Simulate throttling.
      await page.emulateNetworkConditions(networkConditions);
      await page.emulateCPUThrottling(cpuThrottling);

      // Collect CPU and memory info 10 times per second.
      const perfSampler = await PerfMetricsSampler.create(page, 100);
      disposeCallbacks.push(async () => perfSampler.stop());
      const cpu = new CpuUsage(perfSampler);
      const jsHeap = new JsHeapUsage(perfSampler);

      const vitalsCollector = await WebVitalsCollector.create(page);

      await scenario.run(browser, page);

      // NOTE: FID needs some interaction to actually show a value
      const vitals = await vitalsCollector.collect();

      return new Metrics(scenario, vitals, cpu, jsHeap);
    } finally {
      disposeCallbacks.reverse().forEach((cb) => cb().catch(console.log));
    }
  }
}
