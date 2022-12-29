import assert from 'assert';
import * as puppeteer from 'puppeteer';

import { CpuUsage } from './perf/cpu.js';
import { JsHeapUsage } from './perf/memory.js';
import { PerfMetricsSampler } from './perf/sampler.js';
import { Scenario, TestCase } from './scenarios.js';
import { WebVitals, WebVitalsCollector } from './vitals/index.js';

const cpuThrottling = 4;
const networkConditions = puppeteer.PredefinedNetworkConditions['Fast 3G'];

export class Metrics {
  constructor(public scenario: Scenario, public vitals: WebVitals,
    public cpu: CpuUsage, public memory: JsHeapUsage) { }
}

export class MetricsCollector {
  public async execute(testCase: TestCase): Promise<void> {
    console.log(`Executing test case ${testCase.name}`);
    console.group();
    for (let i = 1; i <= testCase.tries; i++) {
      let aResults = await this.collect('A', testCase.a, testCase.runs);
      let bResults = await this.collect('B', testCase.b, testCase.runs);
      if (await testCase.test(aResults, bResults)) {
        console.groupEnd();
        console.log(`Test case ${testCase.name} passed on try ${i}/${testCase.tries}`);
        break;
      } else if (i != testCase.tries) {
        console.log(`Test case ${testCase.name} failed on try ${i}/${testCase.tries}`);
      } else {
        console.groupEnd();
        console.error(`Test case ${testCase.name} failed`);
      }
    }
  }

  private async collect(name: string, scenario: Scenario, runs: number): Promise<Metrics[]> {
    const label = `Scenario ${name} data collection (total ${runs} runs)`;
    console.time(label);
    const results: Metrics[] = [];
    for (let run = 0; run < runs; run++) {
      let innerLabel = `Scenario ${name} data collection, run ${run}/${runs}`;
      console.time(innerLabel);
      results.push(await this.run(scenario));
      console.timeEnd(innerLabel);
    }
    console.timeEnd(label);
    assert.equal(results.length, runs);
    return results;
  }

  private async run(scenario: Scenario): Promise<Metrics> {
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
