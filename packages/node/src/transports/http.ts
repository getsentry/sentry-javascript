import { SentryEvent, SentryResponse } from '@sentry/types';
import * as http from 'http';
import { BaseTransport, TransportOptions } from './base';

/** /** Node http module transport */
export class HTTPTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(public options: TransportOptions) {
    super(options);
    this.client = new http.Agent(
      this.options.agentOptions
        ? this.options.agentOptions
        : { keepAlive: true, maxSockets: 100 },
    );
  }

  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<SentryResponse> {
    return this.sendWithModule(http, event);
  }
}
