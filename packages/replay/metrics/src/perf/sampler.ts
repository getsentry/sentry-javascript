import * as playwright from 'playwright';
import { Protocol } from 'playwright-core/types/protocol';

import { JsonObject } from '../util/json';

export type PerfMetricsConsumer = (metrics: PerfMetrics) => Promise<void>;
export type TimestampSeconds = number;

export class TimeBasedMap<T> extends Map<TimestampSeconds, T> {
  public static fromJSON<T>(entries: JsonObject<T>): TimeBasedMap<T> {
    const result = new TimeBasedMap<T>();
    // eslint-disable-next-line guard-for-in
    for (const key in entries) {
      result.set(parseFloat(key), entries[key]);
    }
    return result;
  }

  public toJSON(): JsonObject<T> {
    return Object.fromEntries(this.entries());
  }
}

export class PerfMetrics {
  constructor(private _metrics: Protocol.Performance.Metric[]) { }

  private _find(name: string): number {
    return this._metrics.find((metric) => metric.name == name)!.value;
  }

  public get Timestamp(): number {
    return this._find('Timestamp');
  }

  public get Duration(): number {
    // TODO check if any of `Duration` fields is maybe a sum of the others. E.g. verify the measured CPU usage manually.
    return this._metrics.reduce((sum, metric) => metric.name.endsWith('Duration') ? sum + metric.value : sum, 0);
  }

  public get JSHeapUsedSize(): number {
    return this._find('JSHeapUsedSize');
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
      const metrics = await cdp.send('Performance.getMetrics').then((v) => v.metrics);
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
