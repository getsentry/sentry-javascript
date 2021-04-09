import { API, SDK_VERSION } from '@sentry/core';
import {
  AggregatedSessions,
  Event,
  Response,
  SentryRequest,
  SentryRequestType,
  Session,
  Status,
  Transport,
  TransportOptions,
} from '@sentry/types';
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

const CATEGORY_MAPPING: {
  [key in SentryRequestType]: string;
} = {
  event: 'error',
  transaction: 'transaction',
  session: 'session',
  sessions: 'sessions',
};

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

  /** Locks transport after receiving rate limits in a response */
  protected readonly _rateLimits: Record<string, Date> = {};

  // /** Locks transport after receiving 429 response */
  // private _disabledUntil: Date = new Date(Date.now());

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
  public sendSession(_: Session): PromiseLike<Response> {
    throw new SentryError('Transport Class has to implement `sendSession` method.');
  }

  /**
   * @inheritDoc
   */
  public sendSessions(_: AggregatedSessions): PromiseLike<Response> {
    throw new SentryError('Transport Class has to implement `sendSessions` method.');
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

  /**
   * Gets the time that given category is disabled until for rate limiting
   */
  protected _disabledUntil(requestType: SentryRequestType): Date {
    const category = CATEGORY_MAPPING[requestType];
    return this._rateLimits[category] || this._rateLimits.all;
  }

  /**
   * Checks if a category is rate limited
   */
  protected _isRateLimited(requestType: SentryRequestType): boolean {
    return this._disabledUntil(requestType) > new Date(Date.now());
  }

  /**
   * Sets internal _rateLimits from incoming headers. Returns true if headers contains a non-empty rate limiting header.
   */
  protected _handleRateLimit(headers: Record<string, string | null>): boolean {
    const now = Date.now();
    const rlHeader = headers['x-sentry-rate-limits'];
    const raHeader = headers['retry-after'];

    if (rlHeader) {
      // rate limit headers are of the form
      //     <header>,<header>,..
      // where each <header> is of the form
      //     <retry_after>: <categories>: <scope>: <reason_code>
      // where
      //     <retry_after> is a delay in ms
      //     <categories> is the event type(s) (error, transaction, etc) being rate limited and is of the form
      //         <category>;<category>;...
      //     <scope> is what's being limited (org, project, or key) - ignored by SDK
      //     <reason_code> is an arbitrary string like "org_quota" - ignored by SDK
      for (const limit of rlHeader.trim().split(',')) {
        const parameters = limit.split(':', 2);
        const headerDelay = parseInt(parameters[0], 10);
        const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1000; // 60sec default
        for (const category of parameters[1].split(';')) {
          this._rateLimits[category || 'all'] = new Date(now + delay);
        }
      }
      return true;
    } else if (raHeader) {
      this._rateLimits.all = new Date(now + parseRetryAfterHeader(now, raHeader));
      return true;
    }
    return false;
  }

  /** JSDoc */
  protected async _sendWithModule(
    httpModule: HTTPModule,
    sentryReq: SentryRequest,
    originalPayload: Event | Session | AggregatedSessions,
  ): Promise<Response> {
    if (this._isRateLimited(sentryReq.type)) {
      return Promise.reject({
        event: originalPayload,
        type: sentryReq.type,
        reason: `Transport locked till ${this._disabledUntil(sentryReq.type)} due to too many requests.`,
        status: 429,
      });
    }

    if (!this._buffer.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        const options = this._getRequestOptions(new url.URL(sentryReq.url));

        const req = httpModule.request(options, (res: http.IncomingMessage) => {
          const statusCode = res.statusCode || 500;
          const status = Status.fromHttpCode(statusCode);

          res.setEncoding('utf8');

          /**
           * "Key-value pairs of header names and values. Header names are lower-cased."
           * https://nodejs.org/api/http.html#http_message_headers
           */
          let retryAfterHeader = res.headers ? res.headers['retry-after'] : '';
          retryAfterHeader = (Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader) as string;

          let rlHeader = res.headers ? res.headers['x-sentry-rate-limits'] : '';
          rlHeader = (Array.isArray(rlHeader) ? rlHeader[0] : rlHeader) as string;

          const headers = {
            'x-sentry-rate-limits': rlHeader,
            'retry-after': retryAfterHeader,
          };

          const limited = this._handleRateLimit(headers);
          if (limited) logger.warn(`Too many requests, backing off until: ${this._disabledUntil(sentryReq.type)}`);

          let rejectionMessage = `HTTP Error (${statusCode})`;
          if (res.headers && res.headers['x-sentry-error']) {
            rejectionMessage += `: ${res.headers['x-sentry-error']}`;
          }

          if (status === Status.Success) {
            resolve({ status });
          }

          reject(new SentryError(rejectionMessage));

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
