import { API, eventToSentryRequest, SDK_VERSION, sessionToSentryRequest } from '@sentry/core';
import {
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
import { logger, PromiseBuffer, SentryError } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import { SDK_NAME } from '../version';
import { HTTPModule } from './base/http-module';

export type URLParts = Pick<URL, 'hostname' | 'pathname' | 'port' | 'protocol'>;
export type UrlParser = (url: string) => URLParts;

const DEFAULT_BUFFER_SIZE = 30;
const DEFAULT_QUEUE_SIZE = 10;

type TaskProducer = () => Promise<Response>;
type PayloadType = Event | Session | SessionAggregates;

/** Simple queue with predefined size limit */
class Queue<T> {
  private _store: Array<T> = [];
  public constructor(private readonly _limit: number) {}

  /** Add item to the queue if it has enough space */
  public enqueue(item: T): void {
    if (this._store.length >= this._limit) {
      throw new RangeError('Queue is full');
    }
    this._store.push(item);
  }

  /** Remove and return first item from the queue */
  public dequeue(): T | undefined {
    return this._store.shift();
  }
}

/** Base Transport class implementation */
export class QTransport implements Transport {
  /** The Agent used for corresponding transport */
  public module: HTTPModule = https;

  private readonly _api: API;
  private readonly _buffer: PromiseBuffer<Response>;
  private readonly _queues: { [key in SentryRequestType]: Queue<[SentryRequest, PayloadType]> };
  private readonly _queuesOrder: Array<SentryRequestType> = ['event', 'transaction', 'session'];
  private _currentQueueIndex: number = 0;

  /** Create instance and set this.dsn */
  public constructor(public options: TransportOptions) {
    this._api = new API(options.dsn, options._metadata, options.tunnel);
    this._buffer = new PromiseBuffer(options.bufferSize ?? DEFAULT_BUFFER_SIZE);
    this._queues = this._queuesOrder.reduce((acc, key) => {
      acc[key] = new Queue(options.queueSize?.[key] ?? DEFAULT_QUEUE_SIZE);
      return acc;
    }, {} as { [key in SentryRequestType]: Queue<[SentryRequest, PayloadType]> });
  }

  /** Default function used to parse URLs */
  public urlParser: UrlParser = url => new URL(url);

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    return this._send(eventToSentryRequest(event, this._api), event);
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: Session | SessionAggregates): Promise<Response> {
    return this._send(sessionToSentryRequest(session, this._api), session);
  }

  /**
   * @inheritDoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._buffer.drain(timeout);
  }

  /** Returns a build request option object used by request */
  private _getRequestOptions(urlParts: URLParts): http.RequestOptions | https.RequestOptions {
    const headers = {
      ...this._api.getRequestHeaders(SDK_NAME, SDK_VERSION),
      ...this.options.headers,
    };
    const { hostname, pathname, port, protocol } = urlParts;
    // See https://github.com/nodejs/node/blob/38146e717fed2fabe3aacb6540d839475e0ce1c6/lib/internal/url.js#L1268-L1290
    // We ignore the query string on purpose
    const path = `${pathname}`;

    return {
      headers,
      hostname,
      method: 'POST',
      path,
      port,
      protocol,
    };
  }

  /** JSDoc */
  private _createTask(sentryRequest: SentryRequest): TaskProducer {
    return () =>
      new Promise<Response>((resolve, reject) => {
        const options = this._getRequestOptions(this.urlParser(sentryRequest.url));
        const req = this.module.request(options, res => {
          const statusCode = res.statusCode || 500;
          const status = Status.fromHttpCode(statusCode);

          res.setEncoding('utf8');

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
  private _queueRequest(sentryRequest: SentryRequest, originalPayload: PayloadType): void {
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
  private _yieldQueue(): Queue<[SentryRequest, PayloadType]> {
    const currentQueue = this._queues[this._queuesOrder[this._currentQueueIndex]];
    const totalQueues = this._queuesOrder.length;
    const nextQueueIndex = this._currentQueueIndex + 1;
    this._currentQueueIndex = nextQueueIndex >= totalQueues ? 0 : nextQueueIndex;
    return currentQueue;
  }

  /** JSDoc */
  private _poolQueues(): void {
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
  private async _send(sentryRequest: SentryRequest, originalPayload: PayloadType): Promise<Response> {
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

    void taskPromise.then(
      () => this._poolQueues(),
      () => this._poolQueues(),
    );

    return taskPromise;
  }
}
