import { SentryEvent, SentryResponse, TransportOptions } from '@sentry/types';
import * as http from 'http';
import HttpsProxyAgent from 'https-proxy-agent';
import { BaseTransport } from './base';

/** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    const proxy = options.httpProxy || process.env.http_proxy;
    this.client = proxy
      ? (new HttpsProxyAgent(proxy) as http.Agent)
      : new http.Agent({ keepAlive: true, maxSockets: 100 });
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(http, event);
  }
}
