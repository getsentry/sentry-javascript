import * as playwright from 'playwright';
import { Protocol } from 'playwright-core/types/protocol';

export type PerfMetricsConsumer = (metrics: PerfMetrics) => Promise<void>;
export type TimestampSeconds = number;

export class TimeBasedMap<T> extends Map<TimestampSeconds, T> {
  public toJSON(): any {
    return Object.fromEntries(this.entries());
  }

  public static fromJSON<T>(entries: Object): TimeBasedMap<T> {
    const result = new TimeBasedMap<T>();
    for (const key in entries) {
      const value = entries[key as keyof Object];
      result.set(parseFloat(key), value as T);
    }
    return result;
  }
}

export class PerfMetrics {
  constructor(private metrics: Protocol.Performance.Metric[]) { }

  private find(name: string): number {
    return this.metrics.find((metric) => metric.name == name)!.value;
  }

  public get Timestamp(): number {
    return this.find('Timestamp');
  }

  public get Duration(): number {
    return this.metrics.reduce((sum, metric) => metric.name.endsWith('Duration') ? sum + metric.value : sum, 0);
  }

  public get JSHeapUsedSize(): number {
    return this.find('JSHeapUsedSize');
  }
}

export class PerfMetricsSampler {
  private _consumers: PerfMetricsConsumer[] = [];
  private _timer!: NodeJS.Timer;

  public static async create(cdp: playwright.CDPSession, interval: number): Promise<PerfMetricsSampler> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })

    const self = new PerfMetricsSampler();

    self._timer = setInterval(async () => {
      const metrics = await cdp.send("Performance.getMetrics").then((v) => v.metrics);
      self._consumers.forEach((cb) => cb(new PerfMetrics(metrics)).catch(console.log));
    }, interval);

    return self;
  }

  public subscribe(consumer: PerfMetricsConsumer): void {
    this._consumers.push(consumer);
  }

  public stop(): void {
    clearInterval(this._timer);
  }
}
