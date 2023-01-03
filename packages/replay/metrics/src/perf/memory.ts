import { PerfMetrics, PerfMetricsSampler, TimeBasedMap } from './sampler.js';

export { JsHeapUsageSampler, JsHeapUsage }

class JsHeapUsage {
  public constructor(public snapshots: TimeBasedMap<number>) { }

  public static fromJSON(data: Partial<JsHeapUsage>): JsHeapUsage {
    return new JsHeapUsage(TimeBasedMap.fromJSON<number>(data.snapshots || []));
  }
}

class JsHeapUsageSampler {
  private _snapshots = new TimeBasedMap<number>();

  public constructor(sampler: PerfMetricsSampler) {
    sampler.subscribe(this._collect.bind(this));
  }

  public getData(): JsHeapUsage {
    return new JsHeapUsage(this._snapshots);
  }

  private async _collect(metrics: PerfMetrics): Promise<void> {
    this._snapshots.set(metrics.Timestamp, metrics.JSHeapUsedSize!);
  }
}
