import { Response, Status } from '../../src';
import { BaseTransport } from '../../src/transports';

export class SetTimeoutTransport extends BaseTransport {
  public async sendEvent(_: string): Promise<Response> {
    return this.buffer.add(
      new Promise<Response>(resolve => {
        setTimeout(() => {
          resolve({
            status: Status.fromHttpCode(200),
          });
        }, 1);
      }),
    );
  }
}
