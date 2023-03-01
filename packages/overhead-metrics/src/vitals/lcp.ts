import type * as playwright from 'playwright';

export { LCP };

// https://web.dev/lcp/
class LCP {
  public constructor(private _page: playwright.Page) {}

  public async setup(): Promise<void> {
    await this._page.context().addInitScript(`{
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

  public async collect(): Promise<number | undefined> {
    const result = await this._page.evaluate('window.largestContentfulPaint');
    return result as number;
  }
}
