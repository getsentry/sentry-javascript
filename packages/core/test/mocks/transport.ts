import { Event, Response, Transport } from '@sentry/types';
import { makePlatformPromise, makePromiseBuffer, PromiseBuffer } from '@sentry/utils';

async function sleep(delay: number): Promise<void> {
  return makePlatformPromise(resolve => setTimeout(resolve, delay));
}

export class FakeTransport implements Transport {
  public sendCalled: number = 0;
  public sentCount: number = 0;
  public delay: number = 2000;

  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = makePromiseBuffer(9999);

  public sendEvent(_event: Event): PromiseLike<Response> {
    this.sendCalled += 1;
    return this._buffer.add(() =>
      makePlatformPromise(async res => {
        await sleep(this.delay);
        this.sentCount += 1;
        res({ status: 'success' });
      }),
    );
  }

  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}
