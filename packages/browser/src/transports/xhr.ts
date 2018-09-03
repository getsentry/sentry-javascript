import { SentryEvent, SentryResponse, Status } from '@sentry/types';
import { serialize } from '@sentry/utils/object';
import { BaseTransport } from './base';

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public async captureEvent(event: SentryEvent): Promise<SentryResponse> {
    return new Promise<SentryResponse>((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          return;
        }

        if (request.status === 200) {
          resolve({
            status: Status.fromHttpCode(request.status),
          });
        }

        reject(request);
      };

      request.open('POST', this.url);
      request.send(serialize(event));
    });
  }
}
