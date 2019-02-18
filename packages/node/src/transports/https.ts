import { Response, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils/error';
import * as https from 'https';
import * as HttpsProxyAgent from 'https-proxy-agent';
import { BaseTransport } from './base';

/** Node https module transport */
export class HTTPSTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.module = https;
    const proxy = options.httpsProxy || options.httpProxy || process.env.https_proxy || process.env.http_proxy;
    this.client = proxy
      ? // tslint:disable-next-line:no-unsafe-any
        (new HttpsProxyAgent(proxy) as https.Agent)
      : new https.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 });
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(body: string): Promise<Response> {
    if (!this.module) {
      throw new SentryError('No module available in HTTPSTransport');
    }
    return this.sendWithModule(this.module, body);
  }
}
