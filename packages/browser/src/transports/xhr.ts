import { Event, Response, Status } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    return this._buffer.add(
      new SyncPromise<Response>((resolve, reject) => {
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
        request.send(JSON.stringify(event));
      }),
    );
  }
}
