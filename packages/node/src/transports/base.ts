import { API } from '@sentry/core';
import { Response, Status, Transport, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils/error';
import { PromiseBuffer } from '@sentry/utils/promisebuffer';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import { SDK_NAME, SDK_VERSION } from '../version';

/**
 * Internal used interface for typescript.
 * @hidden
 */
export interface HTTPRequest {
  request(
    options: http.RequestOptions | https.RequestOptions | string | url.URL,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest;
}

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /** API object */
  protected api: API;

  /** The Agent used for corresponding transport */
  public module?: HTTPRequest;

  /** The Agent used for corresponding transport */
  public client?: http.Agent | https.Agent;

  /** A simple buffer holding all requests. */
  protected readonly buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Create instance and set this.dsn */
  public constructor(public options: TransportOptions) {
    this.api = new API(options.dsn);
  }

  /** Returns a build request option object used by request */
  protected getRequestOptions(): http.RequestOptions | https.RequestOptions {
    const headers = {
      ...this.api.getRequestHeaders(SDK_NAME, SDK_VERSION),
      ...this.options.headers,
    };
    const dsn = this.api.getDsn();

    const options: {
      [key: string]: any;
    } = {
      agent: this.client,
      headers,
      hostname: dsn.host,
      method: 'POST',
      path: this.api.getStoreEndpointPath(),
      port: dsn.port,
      protocol: `${dsn.protocol}:`,
    };

    if (this.options.caCerts) {
      options.ca = fs.readFileSync(this.options.caCerts);
    }

    return options;
  }

  /** JSDoc */
  protected async sendWithModule(httpModule: HTTPRequest, body: string): Promise<Response> {
    return this.buffer.add(
      new Promise<Response>((resolve, reject) => {
        const req = httpModule.request(this.getRequestOptions(), (res: http.IncomingMessage) => {
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
        req.end(body);
      }),
    );
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(_: string): Promise<Response> {
    throw new SentryError('Transport Class has to implement `sendEvent` method.');
  }

  /**
   * @inheritDoc
   */
  public async close(timeout?: number): Promise<boolean> {
    return this.buffer.drain(timeout);
  }
}
