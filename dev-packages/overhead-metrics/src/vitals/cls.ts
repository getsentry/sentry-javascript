import type * as playwright from 'playwright';

export { CLS };

// https://web.dev/cls/
class CLS {
  public constructor(private _page: playwright.Page) {}

  public async setup(): Promise<void> {
    await this._page.context().addInitScript(`{
      window.cumulativeLayoutShiftScore = undefined;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (window.cumulativeLayoutShiftScore === undefined) {
            window.cumulativeLayoutShiftScore = entry.value;
          } else if (!entry.hadRecentInput) {
            window.cumulativeLayoutShiftScore += entry.value;
          }
        }
      });

      observer.observe({type: 'layout-shift', buffered: true});

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          observer.takeRecords();
          observer.disconnect();
        }
      });
    }`);
  }

  public async collect(): Promise<number | undefined> {
    const result = await this._page.evaluate('window.cumulativeLayoutShiftScore');
    return result as number;
  }
}
