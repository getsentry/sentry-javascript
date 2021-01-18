import { API, eventToSentryRequest, SDK_VERSION } from '@sentry/core';
import { Event, Response, Status, Transport, TransportOptions } from '@sentry/types';
import { logger, parseRetryAfterHeader, PromiseBuffer, SentryError } from '@sentry/utils';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

import { SDK_NAME } from '../version';

/**
 * Internal used interface for typescript.
 * @hidden
 */
export interface HTTPModule {
  /**
   * Request wrapper
   * @param options These are {@see TransportOptions}
   * @param callback Callback when request is finished
   */
  request(
    options: http.RequestOptions | https.RequestOptions | string | url.URL,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest;

  // This is the type for nodejs versions that handle the URL argument
  // (v10.9.0+), but we do not use it just yet because we support older node
  // versions:

  // request(
  //   url: string | url.URL,
  //   options: http.RequestOptions | https.RequestOptions,
  //   callback?: (res: http.IncomingMessage) => void,
  // ): http.ClientRequest;
}

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /** The Agent used for corresponding transport */
  public module?: HTTPModule;

  /** The Agent used for corresponding transport */
  public client?: http.Agent | https.Agent;

  /** API object */
  protected _api: API;

  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response> = new PromiseBuffer(30);

  /** Locks transport after receiving 429 response */
  private _disabledUntil: Date = new Date(Date.now());

  /** Create instance and set this.dsn */
  public constructor(public options: TransportOptions) {
    this._api = new API(options.dsn, options._metadata);
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

  /** Returns a build request option object used by request */
  protected _getRequestOptions(uri: url.URL): http.RequestOptions | https.RequestOptions {
    const headers = {
      ...this._api.getRequestHeaders(SDK_NAME, SDK_VERSION),
      ...this.options.headers,
    };
    const { hostname, pathname, port, protocol } = uri;
    // See https://github.com/nodejs/node/blob/38146e717fed2fabe3aacb6540d839475e0ce1c6/lib/internal/url.js#L1268-L1290
    // We ignore the query string on purpose
    const path = `${pathname}`;

    return {
      agent: this.client,
      headers,
      hostname,
      method: 'POST',
      path,
      port,
      protocol,
      ...(this.options.caCerts && {
        ca: fs.readFileSync(this.options.caCerts),
      }),
    };
  }

  /** JSDoc */
  protected async _sendWithModule(httpModule: HTTPModule, event: Event): Promise<Response> {
    if (new Date(Date.now()) < this._disabledUntil) {
      return Promise.reject(new SentryError(`Transport locked till ${this._disabledUntil} due to too many requests.`));
    }

    if (!this._buffer.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        const sentryReq = eventToSentryRequest(event, this._api);
        const options = this._getRequestOptions(new url.URL(sentryReq.url));

        const req = httpModule.request(options, (res: http.IncomingMessage) => {
          const statusCode = res.statusCode || 500;
          const status = Status.fromHttpCode(statusCode);

          res.setEncoding('utf8');

          if (status === Status.Success) {
            resolve({ status });
          } else {
            if (status === Status.RateLimit) {
              const now = Date.now();
              /**
               * "Key-value pairs of header names and values. Header names are lower-cased."
               * https://nodejs.org/api/http.html#http_message_headers
               */
              let retryAfterHeader = res.headers ? res.headers['retry-after'] : '';
              retryAfterHeader = (Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader) as string;
              this._disabledUntil = new Date(now + parseRetryAfterHeader(now, retryAfterHeader));
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
        req.end(sentryReq.body);
      }),
    );
  }
}
