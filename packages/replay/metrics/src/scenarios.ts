import * as puppeteer from 'puppeteer';
import { Metrics } from './collector';

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
