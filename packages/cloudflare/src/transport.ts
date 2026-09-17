import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { createTransport, SENTRY_BUFFER_FULL_ERROR, suppressTracing } from '@sentry/core';

export interface CloudflareTransportOptions extends BaseTransportOptions {
  /** Custom fetch function to use. This allows usage of things like Workers VPC */
  fetch?: typeof fetch;
  /** Fetch API init parameters. */
  fetchOptions?: RequestInit;
}

/**
 * How many payloads the buffer holds before it starts rejecting new ones.
 *
 * With `cacheClient` a single client is reused across an isolate's invocations, so one buffer now has to absorb
 * the payloads of many invocations rather than one. 256 is the size that held up under load testing that scenario.
 */
const DEFAULT_TRANSPORT_BUFFER_SIZE = 256;

type TaskProducer = () => PromiseLike<TransportMakeRequestResponse>;
type RunTask = (taskProducer: TaskProducer, signal: AbortSignal) => PromiseLike<TransportMakeRequestResponse>;

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

  private _taskProducers: TaskProducer[];

  private readonly _bufferSize: number;

  private readonly _runTask: RunTask;

  public constructor(_bufferSize = DEFAULT_TRANSPORT_BUFFER_SIZE, _runTask: RunTask = taskProducer => taskProducer()) {
    this.$ = [];
    this._taskProducers = [];
    this._bufferSize = _bufferSize;
    this._runTask = _runTask;
  }

  /**
   * @inheritdoc
   */
  public add(taskProducer: TaskProducer): PromiseLike<TransportMakeRequestResponse> {
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
    const tasks = oldTaskProducers.map(taskProducer => this._runTask(taskProducer, drainController.signal));

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (timeout && timeout > 0) {
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
  let activeDrainSignal: AbortSignal | undefined;

  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const controller = new AbortController();
    const callerSignal = options.fetchOptions?.signal;
    const drainSignal = activeDrainSignal;
    const abortFromCallerSignal = (): void => controller.abort();
    const abortFromDrainSignal = (): void => controller.abort();

    if (callerSignal?.aborted) {
      controller.abort();
    } else {
      callerSignal?.addEventListener('abort', abortFromCallerSignal, { once: true });
    }

    if (drainSignal?.aborted) {
      controller.abort();
    } else {
      drainSignal?.addEventListener('abort', abortFromDrainSignal, { once: true });
    }

    const requestOptions: RequestInit = {
      body: request.body as BodyInit,
      method: 'POST',
      headers: options.headers,
      ...options.fetchOptions,
      signal: controller.signal,
    };

    const requestPromise = suppressTracing(() => {
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

    return Promise.resolve(requestPromise).finally(() => {
      callerSignal?.removeEventListener('abort', abortFromCallerSignal);
      drainSignal?.removeEventListener('abort', abortFromDrainSignal);
    });
  }

  function runTaskWithinDrain(
    taskProducer: TaskProducer,
    signal: AbortSignal,
  ): PromiseLike<TransportMakeRequestResponse> {
    activeDrainSignal = signal;
    try {
      return taskProducer();
    } finally {
      activeDrainSignal = undefined;
    }
  }

  return createTransport(options, makeRequest, new IsolatedPromiseBuffer(options.bufferSize, runTaskWithinDrain));
}
