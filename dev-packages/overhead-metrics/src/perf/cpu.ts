import type { JsonObject } from '../util/json.js';
import type { PerfMetrics, PerfMetricsSampler } from './sampler.js';
import { TimeBasedMap } from './sampler.js';

export { CpuUsageSampler, CpuUsage };

export type CpuUsageSerialized = Partial<{ snapshots: JsonObject<number>; average: number }>;

class CpuUsage {
  public constructor(public snapshots: TimeBasedMap<number>, public average: number) {}

  public static fromJSON(data: CpuUsageSerialized): CpuUsage {
    return new CpuUsage(TimeBasedMap.fromJSON<number>(data.snapshots || {}), data.average as number);
  }
}

class MetricsDataPoint {
  public constructor(public timestamp: number, public activeTime: number) {}
}

class CpuUsageSampler {
  private _snapshots: TimeBasedMap<number> = new TimeBasedMap<number>();
  private _average: number = 0;
  private _initial?: MetricsDataPoint = undefined;
  private _startTime!: number;
  private _lastTimestamp!: number;
  private _cumulativeActiveTime!: number;

  public constructor(sampler: PerfMetricsSampler) {
    sampler.subscribe(this._collect.bind(this));
  }

  public getData(): CpuUsage {
    return new CpuUsage(this._snapshots, this._average);
  }

  private async _collect(metrics: PerfMetrics): Promise<void> {
    const data = new MetricsDataPoint(metrics.Timestamp, metrics.Duration);
    if (this._initial == undefined) {
      this._initial = data;
      this._startTime = data.timestamp;
    } else {
      const frameDuration = data.timestamp - this._lastTimestamp;
      const usage = frameDuration == 0 ? 0 : (data.activeTime - this._cumulativeActiveTime) / frameDuration;

      this._snapshots.set(data.timestamp, usage);
      this._average = data.activeTime / (data.timestamp - this._startTime);
    }
    this._lastTimestamp = data.timestamp;
    this._cumulativeActiveTime = data.activeTime;
  }
}
