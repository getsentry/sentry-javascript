import { API, SentryError } from '@sentry/core';
import { SentryEvent, SentryResponse, Transport, TransportOptions } from '@sentry/types';

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * @inheritDoc
   */
  public url: string;

  public constructor(public options: TransportOptions) {
    this.url = new API(this.options.dsn).getStoreEndpointWithUrlEncodedAuth();
  }

  /**
   * @inheritDoc
   */
  public async captureEvent(_: SentryEvent): Promise<SentryResponse> {
    throw new SentryError('Transport Class has to implement `captureEvent` method');
  }
}
