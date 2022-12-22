import * as puppeteer from 'puppeteer';

// A testing scenario we want to collect metrics for.
export interface Scenario {
  run(browser: puppeteer.Browser, page: puppeteer.Page): Promise<void>;
}

// A simple scenario that just loads the given URL.
export class LoadPageScenario implements Scenario {
  public constructor(public url: string) { }

  public async run(_: puppeteer.Browser, page: puppeteer.Page): Promise<void> {
    await page.goto(this.url, {waitUntil : 'load', timeout : 60000});
  }
}
