import { Event, Response, Status, Transport } from '@sentry/types';
import { PromiseBuffer, SyncPromise } from '@sentry/utils';

async function sleep(delay: number): Promise<void> {
  return new SyncPromise(resolve => setTimeout(resolve, delay));
}

export class FakeTransport implements Transport {
  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(9999);

  public sendCalled: number = 0;
  public sentCount: number = 0;
  public delay: number = 2000;

  public sendEvent(_event: Event): Promise<Response> {
    this.sendCalled += 1;
    return this._buffer.add(
      new SyncPromise(async res => {
        await sleep(this.delay);
        this.sentCount += 1;
        res({ status: Status.Success });
      }),
    );
  }

  public close(timeout?: number): Promise<boolean> {
    return this._buffer.drain(timeout);
  }
}
