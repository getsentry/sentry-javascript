import { API } from '@sentry/core';
import { Event, Response, Status, Transport, TransportOptions } from '@sentry/types';
import { logger, parseRetryAfterHeader, PromiseBuffer, SentryError, isString } from '@sentry/utils';
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
  /**
   * Request wrapper
   * @param options These are {@see TransportOptions}
   * @param callback Callback when request is finished
   */
  request(
    options: http.RequestOptions | https.RequestOptions | string | url.URL,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest;

  // This is the new type for versions that handle URL argument correctly, but it's most likely not needed here just yet

  // request(
  //   url: string | url.URL,
  //   options: http.RequestOptions | https.RequestOptions,
  //   callback?: (res: http.IncomingMessage) => void,
  // ): http.ClientRequest;
}

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /** API object */
  protected _api: API;

  /** The Agent used for corresponding transport */
  public module?: HTTPRequest;

  /** The Agent used for corresponding transport */
  public client?: http.Agent | https.Agent;

  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Locks transport after receiving 429 response */
  private _disabledUntil: Date = new Date(Date.now());

  /** Create instance and set this.dsn */
  public constructor(public options: TransportOptions) {
    this._api = new API(options.dsn);
  }

  /** Returns a build request option object used by request */
  protected _getRequestOptions(address: string | url.URL): http.RequestOptions | https.RequestOptions {
    if (!isString(address) || !(address instanceof url.URL)) {
      throw new SentryError(`Incorrect transport url: ${address}`);
    }

    const headers = {
      ...this._api.getRequestHeaders(SDK_NAME, SDK_VERSION),
      ...this.options.headers,
    };
    const addr = address instanceof url.URL ? address : new url.URL(address);
    const { hostname, pathname: path, port, protocol } = addr;

    return {
      agent: this.client,
      method: 'POST',
      headers,
      hostname,
      path,
      port,
      protocol,
      ...(this.options.caCerts && {
        ca: fs.readFileSync(this.options.caCerts),
      }),
    };
  }

  /** JSDoc */
  protected async _sendWithModule(httpModule: HTTPRequest, event: Event): Promise<Response> {
    if (new Date(Date.now()) < this._disabledUntil) {
      return Promise.reject(new SentryError(`Transport locked till ${this._disabledUntil} due to too many requests.`));
    }

    if (!this._buffer.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        const req = httpModule.request(this._getRequestOptions('http://foo.com/123'), (res: http.IncomingMessage) => {
          const statusCode = res.statusCode || 500;
          const status = Status.fromHttpCode(statusCode);

          res.setEncoding('utf8');

          if (status === Status.Success) {
            resolve({ status });
          } else {
            if (status === Status.RateLimit) {
              const now = Date.now();
              let header = res.headers ? res.headers['Retry-After'] : '';
              header = Array.isArray(header) ? header[0] : header;
              this._disabledUntil = new Date(now + parseRetryAfterHeader(now, header));
              logger.warn(`Too many requests, backing off till: ${this._disabledUntil}`);
            }

            let rejectionMessage = `HTTP Error (${statusCode})`;
            if (res.headers && res.headers['x-sentry-error']) {
              rejectionMessage += `: ${res.headers['x-sentry-error']}`;
            }

            reject(new SentryError(rejectionMessage));
          }

          // Force the socket to drain
          res.on('data', () => {
            // Drain
          });
          res.on('end', () => {
            // Drain
          });
        });
        req.on('error', reject);
        req.end(JSON.stringify(event));
      }),
    );
  }

  /**
   * @inheritDoc
   */
  public sendEvent(_: Event): PromiseLike<Response> {
    throw new SentryError('Transport Class has to implement `sendEvent` method.');
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }
}
