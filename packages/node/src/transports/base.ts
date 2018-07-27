import { DSN, SentryError } from '@sentry/core';
import { SentryEvent, SentryResponse, Status, Transport, TransportOptions } from '@sentry/types';
import { serialize } from '@sentry/utils/object';
import * as http from 'http';
import * as https from 'https';
import { SDK_NAME, SDK_VERSION } from '../version';

/** Internal used interface for typescript */
export interface HTTPRequest {
  request(
    options: http.RequestOptions | string | URL,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest;
}

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /** DSN object */
  protected dsn: DSN;

  /** The Agent used for corresponding transport */
  protected client: http.Agent | https.Agent | undefined;

  /** Create instance and set this.dsn */
  public constructor(public options: TransportOptions) {
    this.dsn = new DSN(options.dsn);
  }

  /** Returns a Sentry auth header string */
  private getAuthHeader(): string {
    const header = ['Sentry sentry_version=7'];
    header.push(`sentry_timestamp=${new Date().getTime()}`);

    header.push(`sentry_client=${SDK_NAME}/${SDK_VERSION}`);

    header.push(`sentry_key=${this.dsn.user}`);
    if (this.dsn.pass) {
      header.push(`sentry_secret=${this.dsn.pass}`);
    }
    return header.join(', ');
  }

  /** Returns a build request option object used by request */
  protected getRequestOptions(): http.RequestOptions {
    const headers = {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': this.getAuthHeader(),
      ...this.options.headers,
    };

    return {
      agent: this.client,
      headers,
      hostname: this.dsn.host,
      method: 'POST',
      path: `${this.dsn.path ? `/${this.dsn.path}` : ''}/api/${this.dsn.projectId}/store/`,
      port: this.dsn.port,
    };
  }

  /** JSDoc */
  protected async sendWithModule(httpModule: HTTPRequest, event: SentryEvent): Promise<SentryResponse> {
    const requestOptions = this.getRequestOptions();
    return new Promise<SentryResponse>((resolve, reject) => {
      const req = httpModule.request(requestOptions, (res: http.IncomingMessage) => {
        res.setEncoding('utf8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            status: Status.fromHttpCode(res.statusCode),
          });
        } else {
          if (res.headers && res.headers['x-sentry-error']) {
            const reason = res.headers['x-sentry-error'];
            reject(new SentryError(`HTTP Error (${res.statusCode}): ${reason}`));
          } else {
            reject(new SentryError(`HTTP Error (${res.statusCode})`));
          }
        }
        // force the socket to drain
        res.on('data', () => {
          // Drain
        });
        res.on('end', () => {
          // Drain
        });
      });
      req.on('error', reject);
      req.end(serialize(event));
    });
  }

  /**
   * @inheritDoc
   */
  public async send(_: SentryEvent): Promise<SentryResponse> {
    throw new SentryError('Transport Class has to implement `send` method');
  }
}
