import { Event, Response, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as https from 'https';

import { BaseTransport } from './base';

/** Node https module transport */
export class HTTPSTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.module = https;
    const proxy = options.httpsProxy || options.httpProxy || process.env.https_proxy || process.env.http_proxy;
    if(proxy){
      const HttpsProxyAgent = require('https-proxy-agent');
      this.client = (new HttpsProxyAgent(proxy) as https.Agent);
    } else {
      this.client = new https.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
    }
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    if (!this.module) {
      throw new SentryError('No module available in HTTPSTransport');
    }
    return this._sendWithModule(this.module, event);
  }
}
