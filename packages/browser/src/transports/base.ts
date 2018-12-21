import { API, RequestBuffer, SentryError } from '@sentry/core';
import { SentryResponse, Transport, TransportOptions } from '@sentry/types';

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * @inheritDoc
   */
  public url: string;

  /** A simple buffer holding all requests. */
  protected readonly buffer: RequestBuffer<SentryResponse> = new RequestBuffer(30);

  public constructor(public options: TransportOptions) {
    this.url = new API(this.options.dsn).getStoreEndpointWithUrlEncodedAuth();
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(_: string): Promise<SentryResponse> {
    throw new SentryError('Transport Class has to implement `sendEvent` method');
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): Promise<boolean> {
    console.log('calling close');
    return this.buffer.drain(timeout);
  }
}
