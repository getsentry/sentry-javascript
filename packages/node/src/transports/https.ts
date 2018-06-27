import { SentryEvent, SentryResponse } from '@sentry/types';
import * as https from 'https';
import { BaseTransport, TransportOptions } from './base';

/** Node https module transport */
export class HTTPSTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.client = new https.Agent(
      this.options.agentOptions
        ? this.options.agentOptions
        : { keepAlive: true, maxSockets: 100 },
    );
  }

  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(https, event);
  }
}
