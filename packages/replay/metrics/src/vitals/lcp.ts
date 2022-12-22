import * as puppeteer from 'puppeteer';

export {LCP};

// https://web.dev/lcp/
class LCP {
  constructor(
      private _page: puppeteer.Page) {}

  public async setup(): Promise<void> {
    await this._page.evaluateOnNewDocument(`{
      window.largestContentfulPaint = undefined;

      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        window.largestContentfulPaint = lastEntry.renderTime || lastEntry.loadTime;
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          observer.takeRecords();
          observer.disconnect();
        }
      });
    }`);
  }

  public async collect(): Promise<number> {
    const result = await this._page.evaluate('window.largestContentfulPaint');
    return result as number;
  }
}
