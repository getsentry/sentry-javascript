import pTimeout from 'p-timeout';
import * as playwright from 'playwright';

import type { CpuUsageSerialized } from './perf/cpu.js';
import { CpuUsage, CpuUsageSampler } from './perf/cpu.js';
import type { JsHeapUsageSerialized } from './perf/memory.js';
import { JsHeapUsage, JsHeapUsageSampler } from './perf/memory.js';
import type { NetworkUsageSerialized } from './perf/network.js';
import { NetworkUsage, NetworkUsageCollector } from './perf/network.js';
import { PerfMetricsSampler } from './perf/sampler.js';
import { Result } from './results/result.js';
import type { Scenario, TestCase } from './scenarios.js';
import { consoleGroup } from './util/console.js';
import { WebVitals, WebVitalsCollector } from './vitals/index.js';

const networkConditions = 'Fast 3G';

// Same as puppeteer-core PredefinedNetworkConditions
const PredefinedNetworkConditions = Object.freeze({
  'Slow 3G': {
    download: ((500 * 1000) / 8) * 0.8,
    upload: ((500 * 1000) / 8) * 0.8,
    latency: 400 * 5,
    connectionType: 'cellular3g',
  },
  'Fast 3G': {
    download: ((1.6 * 1000 * 1000) / 8) * 0.9,
    upload: ((750 * 1000) / 8) * 0.9,
    latency: 150 * 3.75,
    connectionType: 'cellular3g',
  },
});

export class Metrics {
  public constructor(
    public readonly vitals: WebVitals,
    public readonly cpu: CpuUsage,
    public readonly memory: JsHeapUsage,
    public readonly network: NetworkUsage,
  ) {}

  /**
   *
   */
  public static fromJSON(
    data: Partial<{
      vitals: Partial<WebVitals>;
      cpu: CpuUsageSerialized;
      memory: JsHeapUsageSerialized;
      network: NetworkUsageSerialized;
    }>,
  ): Metrics {
    return new Metrics(
      WebVitals.fromJSON(data.vitals || {}),
      CpuUsage.fromJSON(data.cpu || {}),
      JsHeapUsage.fromJSON(data.memory || {}),
      NetworkUsage.fromJSON(data.network || {}),
    );
  }
}

export interface MetricsCollectorOptions {
  headless: boolean;
  cpuThrottling: number;
}

export class MetricsCollector {
  private _options: MetricsCollectorOptions;

  public constructor(options?: Partial<MetricsCollectorOptions>) {
    this._options = {
      headless: false,
      cpuThrottling: 4,
      ...options,
    };
  }

  /**
   *
   */
  public async execute(testCase: TestCase): Promise<Result> {
    console.log(`Executing test case ${testCase.name}`);
    return consoleGroup(async () => {
      const scenarioResults: Metrics[][] = [];
      for (let s = 0; s < testCase.scenarios.length; s++) {
        scenarioResults.push(await this._collect(testCase, s.toString(), testCase.scenarios[s]));
      }
      return new Result(testCase.name, this._options.cpuThrottling, networkConditions, scenarioResults);
    });
  }

  /**
   *
   */
  private async _collect(testCase: TestCase, name: string, scenario: Scenario): Promise<Metrics[]> {
    const label = `Scenario ${name} data collection (total ${testCase.runs} runs)`;
    for (let try_ = 1; try_ <= testCase.tries; try_++) {
      console.time(label);
      const results: Metrics[] = [];
      for (let run = 1; run <= testCase.runs; run++) {
        const innerLabel = `Scenario ${name} data collection, run ${run}/${testCase.runs}`;
        console.time(innerLabel);
        try {
          results.push(await this._run(scenario));
        } catch (e) {
          console.warn(`${innerLabel} failed with ${e}`);
          break;
        } finally {
          console.timeEnd(innerLabel);
        }
      }
      console.timeEnd(label);
      if (results.length == testCase.runs && (await testCase.shouldAccept(results))) {
        console.log(`Test case ${testCase.name}, scenario ${name} passed on try ${try_}/${testCase.tries}`);
        return results;
      } else if (try_ != testCase.tries) {
        console.log(`Test case ${testCase.name} failed on try ${try_}/${testCase.tries}, retrying`);
      } else {
        throw `Test case ${testCase.name}, scenario ${name} failed after ${testCase.tries} tries.`;
      }
    }
    // Unreachable code, if configured properly:
    console.assert(testCase.tries >= 1);
    return [];
  }

  /**
   *
   */
  private async _run(scenario: Scenario): Promise<Metrics> {
    const disposeCallbacks: (() => Promise<void>)[] = [];
    try {
      return await pTimeout(
        (async () => {
          const browser = await playwright.chromium.launch({
            headless: this._options.headless,
          });
          disposeCallbacks.push(() => browser.close());
          const page = await browser.newPage();
          disposeCallbacks.push(() => page.close());

          const errorLogs: Array<string> = [];
          await page.on('console', message => {
            if (message.type() === 'error') errorLogs.push(message.text());
          });
          await page.on('crash', _ => {
            errorLogs.push('Page crashed');
          });
          await page.on('pageerror', error => {
            errorLogs.push(`${error.name}: ${error.message}`);
          });

          const cdp = await page.context().newCDPSession(page);

          // Simulate throttling.
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: PredefinedNetworkConditions[networkConditions].latency,
            uploadThroughput: PredefinedNetworkConditions[networkConditions].upload,
            downloadThroughput: PredefinedNetworkConditions[networkConditions].download,
          });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: this._options.cpuThrottling });

          // Collect CPU and memory info 10 times per second.
          const perfSampler = await PerfMetricsSampler.create(cdp, 100);
          disposeCallbacks.push(async () => perfSampler.stop());
          const cpuSampler = new CpuUsageSampler(perfSampler);
          const memSampler = new JsHeapUsageSampler(perfSampler);

          const networkCollector = await NetworkUsageCollector.create(page);
          const vitalsCollector = await WebVitalsCollector.create(page);

          await scenario.run(browser, page);

          // NOTE: FID needs some interaction to actually show a value
          const vitals = await vitalsCollector.collect();

          if (errorLogs.length > 0) {
            throw `Error logs in browser console:\n\t\t${errorLogs.join('\n\t\t')}`;
          }

          return new Metrics(vitals, cpuSampler.getData(), memSampler.getData(), networkCollector.getData());
        })(),
        { milliseconds: 60 * 1000 },
      );
    } finally {
      console.log('Disposing of browser and resources');
      disposeCallbacks.reverse();
      const errors = [];
      for (const cb of disposeCallbacks) {
        try {
          await cb();
        } catch (e) {
          errors.push(e instanceof Error ? `${e.name}: ${e.message}` : `${e}`);
        }
      }
      if (errors.length > 0) {
        console.warn(`All disposose callbacks have finished. Errors: ${errors}`);
      } else {
        console.warn('All disposose callbacks have finished.');
      }
    }
  }
}
