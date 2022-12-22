import * as puppeteer from 'puppeteer';

export { CpuMonitor, CpuUsageHistory, CpuSnapshot }

class CpuUsageHistory {
  constructor(public average: number, public snapshots: CpuSnapshot[]) {}
}

class CpuSnapshot {
  constructor(public timestamp: number, public usage: number) { }
}

class MetricsDataPoint {
  constructor(public timestamp: number, public activeTime: number) { };
}

class CpuMonitor {
  public snapshots: CpuSnapshot[] = [];
  public average: number = 0;
  private _timer!: NodeJS.Timer;

  private constructor(private _cdp: puppeteer.CDPSession) {}

  public static async create(cdp: puppeteer.CDPSession, interval: number): Promise<CpuMonitor> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })

    const monitor = new CpuMonitor(cdp);

    let { timestamp: lastTimestamp, activeTime: cumulativeActiveTime } = await monitor._collect();
    const startTime = lastTimestamp;
    monitor._timer = setInterval(async () => {
      const data = await monitor._collect();
      const frameDuration = data.timestamp - lastTimestamp;
      let usage = frameDuration == 0 ? 0 : (data.activeTime - cumulativeActiveTime) / frameDuration;
      if (usage > 1) usage = 1

      cumulativeActiveTime = data.activeTime
      monitor.snapshots.push(new CpuSnapshot(data.timestamp, usage));

      lastTimestamp = data.timestamp
      monitor.average = cumulativeActiveTime / (lastTimestamp - startTime);
    }, interval)
    return monitor;
  }

  public stats(): CpuUsageHistory {
    return new CpuUsageHistory(this.average, this.snapshots);
  }

  public stop(): void {
    clearInterval(this._timer);
  }

  private async _collect(): Promise<MetricsDataPoint> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const metrics = (await this._cdp.send('Performance.getMetrics')).metrics;
    const activeTime = metrics.filter(m => m.name.includes('Duration')).map(m => m.value).reduce((a, b) => a + b)
    return new MetricsDataPoint(metrics.find(m => m.name === 'Timestamp')?.value || 0, activeTime);
  }
}
