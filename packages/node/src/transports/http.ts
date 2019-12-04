import { Event, Response, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as http from 'http';

import { BaseTransport } from './base';

/** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.module = http;
    const proxy = options.httpProxy || process.env.http_proxy;
    if(proxy){
      const HttpsProxyAgent = require('https-proxy-agent');
      this.client = (new HttpsProxyAgent(proxy) as http.Agent);
    } else {
      this.client = new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
    }
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    if (!this.module) {
      throw new SentryError('No module available in HTTPTransport');
    }
    return this._sendWithModule(this.module, event);
  }
}
