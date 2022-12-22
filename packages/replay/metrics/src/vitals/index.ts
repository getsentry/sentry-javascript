import * as puppeteer from 'puppeteer';

import {LCP} from './lcp.js';

export {WebVitals, WebVitalsCollector};


class WebVitals {
  constructor(public lcp: number) {}
}

class WebVitalsCollector {
  private _lcp!: LCP;

  constructor(page: puppeteer.Page) {
    this._lcp = new LCP(page);
  }

  public async setup(): Promise<void> {
    await this._lcp.setup();
  }

  public async collect(): Promise<WebVitals> {
    return new WebVitals(await this._lcp.collect());
  }
}
