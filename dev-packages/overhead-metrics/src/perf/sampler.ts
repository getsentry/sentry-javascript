import type * as playwright from 'playwright';
import type { Protocol } from 'playwright-core/types/protocol';

import type { JsonObject } from '../util/json';

export type PerfMetricsConsumer = (metrics: PerfMetrics) => Promise<void>;
export type TimestampSeconds = number;

export class TimeBasedMap<T> extends Map<TimestampSeconds, T> {
  /**
   *
   */
  public static fromJSON<T>(entries: JsonObject<T>): TimeBasedMap<T> {
    const result = new TimeBasedMap<T>();
    // eslint-disable-next-line guard-for-in
    for (const key in entries) {
      result.set(parseFloat(key), entries[key]);
    }
    return result;
  }

  /**
   *
   */
  public toJSON(): JsonObject<T> {
    return Object.fromEntries(this.entries());
  }
}

export class PerfMetrics {
  public constructor(private _metrics: Protocol.Performance.Metric[]) {}

  /**
   *
   */
  public get Timestamp(): number {
    return this._find('Timestamp');
  }

  /**
   *
   */
  public get Duration(): number {
    return this._find('TaskDuration');
  }

  /**
   *
   */
  public get JSHeapUsedSize(): number {
    return this._find('JSHeapUsedSize');
  }

  /**
   *
   */
  private _find(name: string): number {
    return this._metrics.find(metric => metric.name == name)!.value;
  }
}

export class PerfMetricsSampler {
  private _consumers: PerfMetricsConsumer[] = [];
  private _timer!: NodeJS.Timer;
  private _errorPrinted: boolean = false;

  private constructor(private _cdp: playwright.CDPSession) {}

  /**
   *
   */
  public static async create(cdp: playwright.CDPSession, interval: number): Promise<PerfMetricsSampler> {
    const self = new PerfMetricsSampler(cdp);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });

    // collect first sample immediately
    self._collectSample();

    // and set up automatic collection in the given interval
    self._timer = setInterval(self._collectSample.bind(self), interval);

    return self;
  }

  /**
   *
   */
  public subscribe(consumer: PerfMetricsConsumer): void {
    this._consumers.push(consumer);
  }

  /**
   *
   */
  public stop(): void {
    clearInterval(this._timer);
  }

  /**
   *
   */
  private _collectSample(): void {
    this._cdp.send('Performance.getMetrics').then(
      response => {
        const metrics = new PerfMetrics(response.metrics);
        this._consumers.forEach(cb => cb(metrics).catch(console.error));
      },
      e => {
        // This happens if the browser closed unexpectedly. No reason to try again.
        if (!this._errorPrinted) {
          this._errorPrinted = true;
          console.log(e);
          this.stop();
        }
      },
    );
  }
}
