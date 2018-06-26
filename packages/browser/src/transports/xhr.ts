import { SentryEvent } from '@sentry/types';
import { serialize } from '@sentry/utils/object';
import { BaseTransport } from './base';

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<XMLHttpRequest> {
    return new Promise<XMLHttpRequest>((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          return;
        }

        if (request.status === 200) {
          resolve(request);
        }

        reject(request);
      };

      request.open('POST', this.url);
      request.send(serialize(event));
    });
  }
}
