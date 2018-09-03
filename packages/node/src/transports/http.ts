import { SentryEvent, SentryResponse, TransportOptions } from '@sentry/types';
import * as http from 'http';
import { BaseTransport } from './base';

/** /** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.client = new http.Agent({ keepAlive: true, maxSockets: 100 });
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(http, event);
  }
}
