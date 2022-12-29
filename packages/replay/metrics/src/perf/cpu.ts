import * as puppeteer from 'puppeteer';

import { PerfMetricsSampler, TimeBasedMap } from './sampler.js';

export { CpuUsageSampler, CpuUsage }

class CpuUsage {
  constructor(public snapshots: TimeBasedMap<number>, public average: number) { };

  public static fromJSON(data: Partial<CpuUsage>): CpuUsage {
    return new CpuUsage(
      TimeBasedMap.fromJSON<number>(data.snapshots || []),
      data.average as number,
    );
  }
}

class MetricsDataPoint {
  constructor(public timestamp: number, public activeTime: number) { };
}

class CpuUsageSampler {
  private _snapshots = new TimeBasedMap<number>();
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

  private async _collect(metrics: puppeteer.Metrics): Promise<void> {
    const data = new MetricsDataPoint(metrics.Timestamp!, metrics.TaskDuration! + metrics.TaskDuration! + metrics.LayoutDuration! + metrics.ScriptDuration!);
    if (this._initial == undefined) {
      this._initial = data;
      this._startTime = data.timestamp;
    } else {
      const frameDuration = data.timestamp - this._lastTimestamp;
      let usage = frameDuration == 0 ? 0 : (data.activeTime - this._cumulativeActiveTime) / frameDuration;

      this._snapshots.set(data.timestamp, usage);
      this._average = data.activeTime / (data.timestamp - this._startTime);
    }
    this._lastTimestamp = data.timestamp;
    this._cumulativeActiveTime = data.activeTime;
  }
}
