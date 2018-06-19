import { SentryEvent, Transport } from '@sentry/types';
import { serialize } from '@sentry/utils';

/** `XHR` based transport */
export class XHRTransport implements Transport {
  public constructor(public config: { url: string }) {}

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

      request.open('POST', this.config.url);
      request.send(serialize(event));
    });
  }
}
