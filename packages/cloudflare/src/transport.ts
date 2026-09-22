import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { createTransport, SENTRY_BUFFER_FULL_ERROR, suppressTracing } from '@sentry/core';

export interface CloudflareTransportOptions extends BaseTransportOptions {
  /** Custom fetch function to use. This allows usage of things like Workers VPC */
  fetch?: typeof fetch;
  /** Fetch API init parameters. */
  fetchOptions?: RequestInit;
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

  /**
   * Abort signal of the drain that is starting its requests. It is set only while `drain()` runs the task
   * producers, so a request reads the signal of the drain that sends it.
   */
  public drainSignal: AbortSignal | undefined;

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
      return Promise.reject(SENTRY_BUFFER_FULL_ERROR);
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

    const drainController = new AbortController();
    this.drainSignal = drainController.signal;
    let tasks: PromiseLike<TransportMakeRequestResponse>[];
    try {
      tasks = oldTaskProducers.map(taskProducer => taskProducer());
    } finally {
      this.drainSignal = undefined;
    }

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (timeout && timeout > 0) {
          // Requests still pending when the drain times out are aborted. Otherwise Cloudflare keeps them
          // until it cancels the invocation's `waitUntil` work and logs a warning.
          drainController.abort();
          resolve(false);
        }
      }, timeout);

      // This cannot reject
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      Promise.all(
        tasks.map(task =>
          task.then(null, () => {
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
 * Creates a Transport that uses the native fetch API to send events to Sentry.
 */
export function makeCloudflareTransport(options: CloudflareTransportOptions): Transport {
  const buffer = new IsolatedPromiseBuffer(options.bufferSize);

  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const drainSignal = buffer.drainSignal;
    const callerSignal = options.fetchOptions?.signal ?? undefined;
    const signal =
      drainSignal && callerSignal ? AbortSignal.any([drainSignal, callerSignal]) : (drainSignal ?? callerSignal);

    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      headers: options.headers,
      ...options.fetchOptions,
      ...(signal ? { signal } : {}),
    };

    return suppressTracing(() => {
      return (options.fetch ?? fetch)(options.url, requestOptions).then(async response => {
        // Consume the response body to satisfy Cloudflare Workers' fetch requirements.
        // The runtime requires all fetch response bodies to be read or explicitly canceled
        // to prevent connection stalls and potential deadlocks. We read the body as text
        // even though we don't use the content, as Sentry's response information is in the headers.
        // See: https://github.com/getsentry/sentry-javascript/issues/18534
        try {
          await response.text();
        } catch {
          // no-op
        }

        return {
          statusCode: response.status,
          headers: {
            'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
            'retry-after': response.headers.get('Retry-After'),
          },
        };
      });
    });
  }

  return createTransport(options, makeRequest, buffer);
}
