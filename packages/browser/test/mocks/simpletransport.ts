import { SentryResponse, Status } from '../../src';
import { BaseTransport } from '../../src/transports';

export class SimpleTransport extends BaseTransport {
  public async sendEvent(_: string): Promise<SentryResponse> {
    return this.buffer.add(
      Promise.resolve({
        status: Status.fromHttpCode(200),
      }),
    );
  }
}
