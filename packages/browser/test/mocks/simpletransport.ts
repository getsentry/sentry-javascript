import { Event, Response, Status } from '../../src';
import { BaseTransport } from '../../src/transports';

export class SimpleTransport extends BaseTransport {
  public sendEvent(_: Event): Promise<Response> {
    return this._buffer.add(
      Promise.resolve({
        status: Status.fromHttpCode(200),
      }),
    );
  }
}
