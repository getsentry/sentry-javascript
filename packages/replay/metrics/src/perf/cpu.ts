import * as puppeteer from 'puppeteer';

import { PerfMetricsSampler } from './sampler';

export { CpuUsageSampler, CpuUsage, CpuSnapshot }

class CpuSnapshot {
  constructor(public timestamp: number, public usage: number) { }

  public static fromJSON(data: Partial<CpuSnapshot>): CpuSnapshot {
    return new CpuSnapshot(data.timestamp || NaN, data.usage || NaN);
  }
}

class CpuUsage {
  constructor(public snapshots: CpuSnapshot[], public average: number) { };

  public static fromJSON(data: Partial<CpuUsage>): CpuUsage {
    return new CpuUsage(data.snapshots || [], data.average || NaN);
  }
}

class MetricsDataPoint {
  constructor(public timestamp: number, public activeTime: number) { };
}

class CpuUsageSampler {
  public snapshots: CpuSnapshot[] = [];
  public average: number = 0;
  private _initial?: MetricsDataPoint = undefined;
  private _startTime!: number;
  private _lastTimestamp!: number;
  private _cumulativeActiveTime!: number;

  public constructor(sampler: PerfMetricsSampler) {
    sampler.subscribe(this._collect.bind(this));
  }

  public getData(): CpuUsage {
    return new CpuUsage(this.snapshots, this.average);
  }

  private async _collect(metrics: puppeteer.Metrics): Promise<void> {
    const data = new MetricsDataPoint(metrics.Timestamp!, metrics.TaskDuration! + metrics.TaskDuration! + metrics.LayoutDuration! + metrics.ScriptDuration!);
    if (this._initial == undefined) {
      this._initial = data;
      this._startTime = data.timestamp;
    } else {
      const frameDuration = data.timestamp - this._lastTimestamp;
      let usage = frameDuration == 0 ? 0 : (data.activeTime - this._cumulativeActiveTime) / frameDuration;

      this.snapshots.push(new CpuSnapshot(data.timestamp, usage));
      this.average = data.activeTime / (data.timestamp - this._startTime);
    }
    this._lastTimestamp = data.timestamp;
    this._cumulativeActiveTime = data.activeTime;
  }
}
