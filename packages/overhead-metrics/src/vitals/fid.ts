import type * as playwright from 'playwright';

export { FID };

// https://web.dev/fid/
class FID {
  public constructor(private _page: playwright.Page) {}

  public async setup(): Promise<void> {
    await this._page.context().addInitScript(`{
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

  public async collect(): Promise<number | undefined> {
    const result = await this._page.evaluate('window.firstInputDelay');
    return result as number;
  }
}
