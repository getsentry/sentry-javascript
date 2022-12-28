import * as puppeteer from 'puppeteer';

export { FID };

// https://web.dev/fid/
class FID {
  constructor(
    private _page: puppeteer.Page) { }

  public async setup(): Promise<void> {
    await this._page.evaluateOnNewDocument(`{
      window.firstInputDelay = undefined;

      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          window.firstInputDelay = entry.processingStart - entry.startTime;
        }
      })

      observer.observe({type: 'first-input', buffered: true});

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          observer.takeRecords();
          observer.disconnect();
        }
      });
    }`);
  }

  public async collect(): Promise<number> {
    const result = await this._page.evaluate('window.firstInputDelay');
    return result as number;
  }
}
