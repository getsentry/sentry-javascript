import { SentryEvent, SentryResponse, TransportOptions } from '@sentry/types';
import * as https from 'https';
import { BaseTransport } from './base';

/** Node https module transport */
export class HTTPSTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.client = new https.Agent({ keepAlive: true, maxSockets: 100 });
  }

  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(https, event);
  }
}
