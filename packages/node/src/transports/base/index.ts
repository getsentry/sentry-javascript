/* eslint-disable max-lines */

import { API, SDK_VERSION } from '@sentry/core';
import {
  DsnProtocol,
  Event,
  Response,
  SentryRequest,
  SentryRequestType,
  Session,
  SessionAggregates,
  Status,
  Transport,
  TransportOptions,
} from '@sentry/types';
import { logger, parseRetryAfterHeader, PromiseBuffer, Queue, SentryError } from '@sentry/utils';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import { SDK_NAME } from '../../version';
import { HTTPModule } from './http-module';

export type URLParts = Pick<URL, 'hostname' | 'pathname' | 'port' | 'protocol'>;
export type UrlParser = (url: string) => URLParts;

type OriginalRequestPayload = Event | Session | SessionAggregates;
type RequestsQueue = [SentryRequest, OriginalRequestPayload?];

const CATEGORY_MAPPING: {
  [key in SentryRequestType]: string;
} = {
  event: 'error',
  transaction: 'transaction',
  session: 'session',
  attachment: 'attachment',
};

const DEFAULT_BUFFER_SIZE = 30;
const DEFAULT_QUEUE_SIZE = 10;

/** Base Transport class implementation */
export abstract class BaseTransport implements Transport {
  /** The Agent used for corresponding transport */
  public module?: HTTPModule;

  /** The Agent used for corresponding transport */
  public client?: http.Agent | https.Agent;

  /** API object */
  protected _api: API;

  /** A simple buffer holding all requests. */
  protected readonly _buffer: PromiseBuffer<Response>;

  /** Locks transport after receiving rate limits in a response */
  protected readonly _rateLimits: Record<string, Date> = {};

  private readonly _queues: { [key in SentryRequestType]: Queue<RequestsQueue> };
  // TODO: Should we include `attachment` here as well?
  private readonly _queuesOrder: Array<SentryRequestType> = ['event', 'transaction', 'session'];
  private _currentQueueIndex: number = 0;

  /** Create instance and set this.dsn */
  public constructor(public options: TransportOptions) {
    this._api = new API(options.dsn, options._metadata, options.tunnel);
    this._buffer = new PromiseBuffer(options.bufferSize ?? DEFAULT_BUFFER_SIZE);
    this._queues = this._queuesOrder.reduce((acc, key) => {
      acc[key] = new Queue(options.queueSize?.[key] ?? DEFAULT_QUEUE_SIZE);
      return acc;
    }, {} as { [key in SentryRequestType]: Queue<RequestsQueue> });
  }

  /** Default function used to parse URLs */
  public urlParser: UrlParser = url => new URL(url);

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

  /**
   * Extracts proxy settings from client options and env variables.
   *
   * Honors `no_proxy` env variable with the highest priority to allow for hosts exclusion.
   *
   * An order of priority for available protocols is:
   * `http`  => `options.httpProxy` | `process.env.http_proxy`
   * `https` => `options.httpsProxy` | `options.httpProxy` | `process.env.https_proxy` | `process.env.http_proxy`
   */
  protected _getProxy(protocol: DsnProtocol): string | undefined {
    const { no_proxy, http_proxy, https_proxy } = process.env;
    const { httpProxy, httpsProxy } = this.options;
    const proxy = protocol === 'http' ? httpProxy || http_proxy : httpsProxy || httpProxy || https_proxy || http_proxy;

    if (!no_proxy) {
      return proxy;
    }

    const { host, port } = this._api.getDsn();
    for (const np of no_proxy.split(',')) {
      if (host.endsWith(np) || `${host}:${port}`.endsWith(np)) {
        return;
      }
    }

    return proxy;
  }

  /** Returns a build request option object used by request */
  protected _getRequestOptions(urlParts: URLParts): http.RequestOptions | https.RequestOptions {
    const headers = {
      ...this._api.getRequestHeaders(SDK_NAME, SDK_VERSION),
      ...this.options.headers,
    };
    const { hostname, pathname, port, protocol } = urlParts;
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
        for (const category of (parameters[1] && parameters[1].split(';')) || ['all']) {
          // categoriesAllowed is added here to ensure we are only storing rate limits for categories we support in this
          // sdk and any categories that are not supported will not be added redundantly to the rateLimits object
          const categoriesAllowed = (Object.keys(CATEGORY_MAPPING) as [SentryRequestType])
            .map(k => CATEGORY_MAPPING[k])
            .concat('all');
          if (categoriesAllowed.includes(category)) this._rateLimits[category] = new Date(now + delay);
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
  protected _createTask(sentryRequest: SentryRequest): () => Promise<Response> {
    return () =>
      new Promise<Response>((resolve, reject) => {
        if (!this.module) {
          throw new SentryError('No module available');
        }
        const options = this._getRequestOptions(this.urlParser(sentryRequest.url));
        const req = this.module.request(options, res => {
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
          if (limited)
            logger.warn(
              `Too many ${sentryRequest.type} requests, backing off until: ${this._disabledUntil(sentryRequest.type)}`,
            );

          if (status === Status.Success) {
            resolve({ status });
          } else {
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
        req.end(sentryRequest.body);
      });
  }

  /** JSDoc */
  protected _queueRequest(sentryRequest: SentryRequest, originalPayload?: OriginalRequestPayload): void {
    let requestType = sentryRequest.type;
    // @ts-ignore just why...
    if (requestType === 'sessions') {
      requestType = 'session';
    }

    const queue = this._queues[requestType];

    if (!queue) {
      throw new SentryError(`Incorrect queue type ${requestType}`);
    }

    try {
      queue.enqueue([sentryRequest, originalPayload]);
    } catch (e) {
      throw new SentryError(`Error enqueueing ${requestType} request: ${(e as Error).message}`);
    }
  }

  /** JSDoc */
  protected _yieldQueue(): Queue<RequestsQueue> {
    const currentQueue = this._queues[this._queuesOrder[this._currentQueueIndex]];
    const totalQueues = this._queuesOrder.length;
    const nextQueueIndex = this._currentQueueIndex + 1;
    this._currentQueueIndex = nextQueueIndex >= totalQueues ? 0 : nextQueueIndex;
    return currentQueue;
  }

  /** JSDoc */
  protected _poolQueues(): void {
    const totalQueues = this._queuesOrder.length;

    for (let i = 0; i < totalQueues; i++) {
      const queue = this._yieldQueue();
      const queuedRequest = queue.dequeue();

      if (queuedRequest) {
        const [request, originalPayload] = queuedRequest;
        void this._send(request, originalPayload);
        break;
      }
    }
  }

  /** JSDoc */
  protected async _send(sentryRequest: SentryRequest, originalPayload?: OriginalRequestPayload): Promise<Response> {
    if (!this.module) {
      throw new SentryError('No module available');
    }
    if (originalPayload && this._isRateLimited(sentryRequest.type)) {
      return Promise.reject({
        payload: originalPayload,
        type: sentryRequest.type,
        reason: `Transport for ${sentryRequest.type} requests locked till ${this._disabledUntil(
          sentryRequest.type,
        )} due to too many requests.`,
        status: 429,
      });
    }

    if (!this._buffer.isReady()) {
      logger.warn('Buffer limit reached. Adding task to the queue.');

      try {
        this._queueRequest(sentryRequest, originalPayload);
        return Promise.resolve({ status: Status.Accepted });
      } catch (e) {
        return Promise.reject(e);
      }
    }

    const task = this._createTask(sentryRequest);
    const taskPromise = this._buffer.add(task);

    // TODO: Should we pool if buffer is not saturated?
    // TODO: Verify that there is no race-condition between removing task and taking new one,
    //       when someone sends event at the very same time
    void taskPromise.then(
      () => this._poolQueues(),
      () => this._poolQueues(),
    );

    return taskPromise;
  }
}
