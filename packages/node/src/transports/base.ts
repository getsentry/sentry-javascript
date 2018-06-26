import { DSN, SentryError } from '@sentry/core';
import {
  SentryEvent,
  SentryResponse,
  Transport,
  TransportOptions as BaseOptions,
} from '@sentry/types';
import { serialize } from '@sentry/utils/src/object';
import * as http from 'http';
import * as https from 'https';

/** TODO */
export interface HTTPRequest {
  request(
    options: http.RequestOptions | string | URL,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest;
}

/** TODO */
export interface TransportOptions extends BaseOptions {
  agentOptions?: http.AgentOptions;
  headers?: http.IncomingHttpHeaders;
  port?: number;
}

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /**
   * TODO
   */
  protected dsn: DSN;

  /**
   * TODO
   */
  protected client: http.Agent | https.Agent | undefined;

  /** TODO */
  public constructor(public options: TransportOptions) {
    this.dsn = new DSN(options.dsn);
  }

  /**
   * TODO
   */
  protected getRequestOptions(): http.RequestOptions {
    return {
      agent: this.client,
      headers: this.options.headers,
      hostname: this.dsn.host,
      method: 'POST',
      path: `${this.dsn.path}/api/${this.dsn.projectId}/store/`,
      port: this.dsn.port || this.options.port,
    };
  }

  /** TODO */
  protected async sendWithModule(
    httpModule: HTTPRequest,
    event: SentryEvent,
  ): Promise<SentryResponse> {
    const requestOptions = this.getRequestOptions();
    return new Promise<SentryResponse>((resolve, reject) => {
      const req = httpModule.request(
        requestOptions,
        (res: http.IncomingMessage) => {
          res.setEncoding('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              event_id: event.event_id,
              status: res.statusCode,
            });
          } else {
            const reason = res.headers['x-sentry-error'];
            reject(
              new SentryError(`HTTP Error (${res.statusCode}): ${reason}`),
            );
          }
          // force the socket to drain
          res.on('data', () => {
            // Drain
          });
          res.on('end', () => {
            // Drain
          });
        },
      );
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
