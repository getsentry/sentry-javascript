import * as puppeteer from 'puppeteer';

import {CLS} from './cls.js';
import {LCP} from './lcp.js';

export {WebVitals, WebVitalsCollector};


class WebVitals {
  constructor(public lcp: number, public cls: number) {}
}

class WebVitalsCollector {
  private constructor(private _lcp: LCP, private _cls: CLS) {}

  public static async create(page: puppeteer.Page): Promise<WebVitalsCollector> {
    const result = new WebVitalsCollector(new LCP(page), new CLS(page));
    await result._lcp.setup();
    await result._cls.setup();
    return result;
  }

  public async collect(): Promise<WebVitals> {
    return new WebVitals(
        await this._lcp.collect(),
        await this._cls.collect(),
    );
  }
}
