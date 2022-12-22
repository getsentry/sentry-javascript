import * as puppeteer from 'puppeteer';

import { PerfMetricsSampler } from './sampler';

export { JsHeapUsage }

class JsHeapUsage {
  public snapshots: number[] = [];

  public constructor(sampler: PerfMetricsSampler) {
    sampler.subscribe(this._collect.bind(this));
  }

  private async _collect(metrics: puppeteer.Metrics): Promise<void> {
    this.snapshots.push(metrics.JSHeapUsedSize!);
  }
}
