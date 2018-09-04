import { SentryEvent, SentryResponse, Status } from '../../src';
import { BaseTransport } from '../../src/transports';

export class SetTimeoutTransport extends BaseTransport {
  public async captureEvent(_: SentryEvent): Promise<SentryResponse> {
    return new Promise<SentryResponse>(resolve => {
      setTimeout(() => {
        resolve({
          status: Status.fromHttpCode(200),
        });
      }, (process as any).SENTRY_REQUEST_TIMEOUT || 1);
    });
  }
}
