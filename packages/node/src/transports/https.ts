import { SentryEvent, SentryResponse, TransportOptions } from '@sentry/types';
import * as https from 'https';
import HttpsProxyAgent from 'https-proxy-agent';
import { BaseTransport } from './base';

/** Node https module transport */
export class HTTPSTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    const proxy = options.httpsProxy || options.httpProxy || process.env.https_proxy || process.env.http_proxy;
    this.client = proxy
      ? (new HttpsProxyAgent(proxy) as https.Agent)
      : new https.Agent({ keepAlive: true, maxSockets: 100 });
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(https, event);
  }
}
