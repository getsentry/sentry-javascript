import { SentryEvent, SentryResponse } from '@sentry/types';
import * as https from 'https';
import { BaseTransport, TransportOptions } from './base';

/** TODO */
export class HTTPSTransport extends BaseTransport {
  /** TODO */
  public constructor(public options: TransportOptions) {
    super(options);
    this.client = new https.Agent(
      this.options.agentOptions
        ? this.options.agentOptions
        : { keepAlive: true, maxSockets: 100 },
    );
  }

  // TODO queue handling here

  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(https, event);
  }
}
