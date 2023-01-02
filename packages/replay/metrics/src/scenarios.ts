import path from 'path';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import { Metrics } from './collector';
import assert from 'assert';

// A testing scenario we want to collect metrics for.
export interface Scenario {
  run(browser: puppeteer.Browser, page: puppeteer.Page): Promise<void>;
}

// Two scenarios that are compared to each other.
export interface TestCase {
  name: string;
  a: Scenario;
  b: Scenario;
  runs: number;
  tries: number;

  // Test function that will be executed and given scenarios A and B result sets.
  // Each has exactly `runs` number of items.
  test(aResults: Metrics[], bResults: Metrics[]): Promise<boolean>;
}

// A simple scenario that just loads the given URL.
export class LoadPageScenario implements Scenario {
  public constructor(public url: string) { }

  public async run(_: puppeteer.Browser, page: puppeteer.Page): Promise<void> {
    await page.goto(this.url, { waitUntil: 'load', timeout: 60000 });
  }
}

// Loads test-apps/jank/ as a page source & waits for a short time before quitting.
export class JankTestScenario implements Scenario {
  public constructor(private withSentry: boolean) { }

  public async run(_: puppeteer.Browser, page: puppeteer.Page): Promise<void> {
    let url = path.resolve('./test-apps/jank/' + (this.withSentry ? 'with-sentry' : 'index') + '.html');
    assert(fs.existsSync(url));
    url = 'file:///' + url.replace('\\', '/');
    console.log('Navigating to ', url);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
