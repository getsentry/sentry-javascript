import assert from 'assert';
import * as fs from 'fs';
import path from 'path';
import type * as playwright from 'playwright';

import type { Metrics } from './collector';

// A testing scenario we want to collect metrics for.
export interface Scenario {
  run(browser: playwright.Browser, page: playwright.Page): Promise<void>;
}

// Two scenarios that are compared to each other.
export interface TestCase {
  name: string;
  scenarios: Scenario[];
  runs: number;
  tries: number;

  // Test function that will be executed and given a scenarios result set with exactly `runs` number of items.
  // Should returns true if this "try" should be accepted and collected.
  // If false is returned, `Collector` will retry up to `tries` number of times.
  shouldAccept(results: Metrics[]): Promise<boolean>;
}

// A simple scenario that just loads the given URL.

export class LoadPageScenario implements Scenario {
  public constructor(public url: string) {}

  /**
   *
   */
  public async run(_: playwright.Browser, page: playwright.Page): Promise<void> {
    await page.goto(this.url, { waitUntil: 'load', timeout: 60000 });
  }
}

// Loads test-apps/jank/ as a page source & waits for a short time before quitting.

export class JankTestScenario implements Scenario {
  public constructor(private _indexFile: string) {}

  /**
   *
   */
  public async run(_: playwright.Browser, page: playwright.Page): Promise<void> {
    let url = path.resolve(`./test-apps/jank/${this._indexFile}`);
    assert(fs.existsSync(url));
    url = `file:///${url.replace(/\\/g, '/')}`;
    console.log('Navigating to ', url);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 12000));
  }
}

export class BookingAppScenario implements Scenario {
  public constructor(private _indexFile: string, private _count: number) {}

  /**
   *
   */
  public async run(_: playwright.Browser, page: playwright.Page): Promise<void> {
    let url = path.resolve(`./test-apps/booking-app/${this._indexFile}`);
    assert(fs.existsSync(url));
    url = `file:///${url.replace(/\\/g, '/')}?count=${this._count}`;
    console.log('Navigating to ', url);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // Click "Update"
    await page.click('#search button');

    for (let i = 1; i < 10; i++) {
      await page.click(`.result:nth-child(${i}) [data-select]`);
    }

    // Wait for flushing, which we set to 2000ms - to be safe, we add 1s on top
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
