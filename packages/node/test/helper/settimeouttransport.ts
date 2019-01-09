import { SentryResponse, Status } from '../../src';
import { BaseTransport } from '../../src/transports';

export class SetTimeoutTransport extends BaseTransport {
  public async sendEvent(_: string): Promise<SentryResponse> {
    return this.buffer.add(
      new Promise<SentryResponse>(resolve => {
        setTimeout(() => {
          resolve({
            status: Status.fromHttpCode(200),
          });
        }, 1);
      }),
    );
  }
}
