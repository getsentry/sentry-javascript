import { SentryResponse, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils/error';
import * as http from 'http';
import * as HttpsProxyAgent from 'https-proxy-agent';
import { BaseTransport } from './base';

/** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.module = http;
    const proxy = options.httpProxy || process.env.http_proxy;
    this.client = proxy
      ? // tslint:disable-next-line:no-unsafe-any
        (new HttpsProxyAgent(proxy) as http.Agent)
      : new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(body: string): Promise<SentryResponse> {
    if (!this.module) {
      throw new SentryError('No module available in HTTPTransport');
    }
    return this.sendWithModule(this.module, body);
  }
}
