import * as puppeteer from 'puppeteer';

import { PerfMetricsSampler } from './sampler';

export { JsHeapUsageSampler, JsHeapUsage }

class JsHeapUsage {
  public constructor(public snapshots: number[]) { }

  public static fromJSON(data: Partial<JsHeapUsage>): JsHeapUsage {
    return new JsHeapUsage(data.snapshots || []);
  }
}

class JsHeapUsageSampler {
  public snapshots: number[] = [];

  public constructor(sampler: PerfMetricsSampler) {
    sampler.subscribe(this._collect.bind(this));
  }

  public getData(): JsHeapUsage {
    return new JsHeapUsage(this.snapshots);
  }

  private async _collect(metrics: puppeteer.Metrics): Promise<void> {
    this.snapshots.push(metrics.JSHeapUsedSize!);
  }
}
