import type { JsonObject } from '../util/json.js';
import type { PerfMetrics, PerfMetricsSampler } from './sampler.js';
import { TimeBasedMap } from './sampler.js';

export { JsHeapUsageSampler, JsHeapUsage };

export type JsHeapUsageSerialized = Partial<{ snapshots: JsonObject<number> }>;

class JsHeapUsage {
  public constructor(public snapshots: TimeBasedMap<number>) {}

  public static fromJSON(data: JsHeapUsageSerialized): JsHeapUsage {
    return new JsHeapUsage(TimeBasedMap.fromJSON<number>(data.snapshots || {}));
  }
}

class JsHeapUsageSampler {
  private _snapshots: TimeBasedMap<number> = new TimeBasedMap<number>();

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
