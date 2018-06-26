import { SentryEvent, SentryResponse } from '@sentry/types';
import * as http from 'http';
import { BaseTransport, TransportOptions } from './base';

/** TODO */
export class HTTPTransport extends BaseTransport {
  /** TODO */
  public constructor(public options: TransportOptions) {
    super(options);
    this.client = new http.Agent(
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
    return this.sendWithModule(http, event);
  }
}
