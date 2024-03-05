import { createTransport } from '@sentry/core';
import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { SentryError } from '@sentry/utils';

export interface VercelEdgeTransportOptions extends BaseTransportOptions {
  /** Fetch API init parameters. */
  fetchOptions?: RequestInit;
  /** Custom headers for the transport. */
  headers?: { [key: string]: string };
}

const DEFAULT_TRANSPORT_BUFFER_SIZE = 30;

/**
 * This is a modified promise buffer that collects tasks until drain is called.
 * We need this in the edge runtime because edge function invocations may not share I/O objects, like fetch requests
 * and responses, and the normal PromiseBuffer inherently buffers stuff inbetween incoming requests.
 *
 * A limitation we need to be aware of is that DEFAULT_TRANSPORT_BUFFER_SIZE is the maximum amount of payloads the
 * SDK can send for a given edge function invocation.
 */
export class IsolatedPromiseBuffer {
  // We just have this field because the promise buffer interface requires it.
  // If we ever remove it from the interface we should also remove it here.
  public $: Array<PromiseLike<TransportMakeRequestResponse>>;

  private _taskProducers: (() => PromiseLike<TransportMakeRequestResponse>)[];

  private readonly _bufferSize: number;

  public constructor(_bufferSize = DEFAULT_TRANSPORT_BUFFER_SIZE) {
    this.$ = [];
    this._taskProducers = [];
    this._bufferSize = _bufferSize;
  }

  /**
   * @inheritdoc
   */
  public add(taskProducer: () => PromiseLike<TransportMakeRequestResponse>): PromiseLike<TransportMakeRequestResponse> {
    if (this._taskProducers.length >= this._bufferSize) {
      return Promise.reject(new SentryError('Not adding Promise because buffer limit was reached.'));
    }

    this._taskProducers.push(taskProducer);
    return Promise.resolve({});
  }

  /**
   * @inheritdoc
   */
  public drain(timeout?: number): PromiseLike<boolean> {
    const oldTaskProducers = [...this._taskProducers];
    this._taskProducers = [];

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);

      // This cannot reject
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      Promise.all(
        oldTaskProducers.map(taskProducer =>
          taskProducer().then(null, () => {
            // catch all failed requests
          }),
        ),
      ).then(() => {
        // resolve to true if all fetch requests settled
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
}

/**
 * Creates a Transport that uses the Edge Runtimes native fetch API to send events to Sentry.
 */
export function makeEdgeTransport(options: VercelEdgeTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      headers: options.headers,
      ...options.fetchOptions,
    };

    return fetch(options.url, requestOptions).then(response => {
      return {
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
      };
    });
  }

  return createTransport(options, makeRequest, new IsolatedPromiseBuffer(options.bufferSize));
}
