import * as puppeteer from 'puppeteer';

export {LCP};

class LCP {
  constructor(
      private _page: puppeteer.Page) {}

  public async setup(): Promise<void> {
    await this._page.evaluateOnNewDocument(calcLCP);
  }

  public async collect(): Promise<number> {
    const result = await this._page.evaluate('window.largestContentfulPaint');
    return result as number;
  }
}

const calcLCP = `
console.log('running calcLCP');
window.largestContentfulPaint = 0;

const observer = new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();
  const lastEntry = entries[entries.length - 1];
  window.largestContentfulPaint = lastEntry.renderTime || lastEntry.loadTime;
});

observer.observe({ type: 'largest-contentful-paint', buffered: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    observer.takeRecords();
    observer.disconnect();
    console.log('LCP:', window.largestContentfulPaint);
  }
});
`;
