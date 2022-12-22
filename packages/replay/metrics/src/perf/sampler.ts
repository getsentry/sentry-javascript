import * as puppeteer from 'puppeteer';

export { PerfMetricsSampler }

type PerfMetricsConsumer = (metrics: puppeteer.Metrics) => Promise<void>;

class PerfMetricsSampler {
  private _consumers: PerfMetricsConsumer[] = [];
  private _timer!: NodeJS.Timer;

  public static async create(page: puppeteer.Page, interval: number): Promise<PerfMetricsSampler> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const cdp = await page.target().createCDPSession();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })

    const self = new PerfMetricsSampler();

    self._timer = setInterval(async () => {
      const metrics = await page.metrics();
      self._consumers.forEach((cb) => cb(metrics).catch(console.log));
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
