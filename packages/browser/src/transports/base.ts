import { API } from '@sentry/core';
import { Response, Transport, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils/error';
import { PromiseBuffer } from '@sentry/utils/promisebuffer';

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * @inheritDoc
   */
  public url: string;

  /** A simple buffer holding all requests. */
  protected readonly buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  public constructor(public options: TransportOptions) {
    this.url = new API(this.options.dsn).getStoreEndpointWithUrlEncodedAuth();
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(_: string): Promise<Response> {
    throw new SentryError('Transport Class has to implement `sendEvent` method');
  }

  /**
   * @inheritDoc
   */
  public async close(timeout?: number): Promise<boolean> {
    return this.buffer.drain(timeout);
  }
}
