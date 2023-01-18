import type { Envelope, InternalBaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/types';

function wasRateLimited(result: TransportMakeRequestResponse): boolean {
  return !!(result.headers && 'x-sentry-rate-limits' in result.headers);
}

type BeforeSendResponse = 'send' | 'queue' | 'drop';

interface OfflineTransportOptions extends InternalBaseTransportOptions {
  /**
   * The maximum number of days to keep an event in the queue.
   */
  maxQueueAgeDays?: number;

  /**
   * The maximum number of events to keep in the queue.
   */
  maxQueueCount?: number;

  /**
   * Called every time the number of requests in the queue changes.
   */
  queuedLengthChanged?: (length: number) => void;

  /**
   * Called before attempting to send an event to Sentry.
   *
   * Return 'send' to attempt to send the event.
   * Return 'queue' to queue the event for sending later.
   * Return 'drop' to drop the event.
   */
  beforeSend?: (request: Envelope) => BeforeSendResponse | Promise<BeforeSendResponse>;
}

interface OfflineTransportStore {
  add(env: Envelope): Promise<number>;
  pop(): Promise<[Envelope | undefined, number]>;
}

const START_DELAY = 5_000;
const MAX_DELAY = 2_000_000_000;

/** */
export function makeOfflineTransport<TO>(
  transport: (options: TO) => Transport,
  store: OfflineTransportStore,
): (options: TO & OfflineTransportOptions) => Transport {
  return (options: TO & OfflineTransportOptions) => {
    const baseTransport = transport(options);

    let retryDelay = START_DELAY;
    let lastQueueLength = -1;

    function queueLengthChanged(length: number): void {
      if (options.queuedLengthChanged && length !== lastQueueLength) {
        lastQueueLength = length;
        options.queuedLengthChanged(length);
      }
    }

    function queueRequest(envelope: Envelope): Promise<void> {
      return store.add(envelope).then(count => {
        queueLengthChanged(count);

        setTimeout(() => {
          flushQueue();
        }, retryDelay);

        retryDelay *= 3;

        // If the delay is bigger than 2^31 (max signed 32-bit int), setTimeout throws
        // an error on node.js and falls back to 1 which can cause a huge number of requests.
        if (retryDelay > MAX_DELAY) {
          retryDelay = MAX_DELAY;
        }
      });
    }

    function flushQueue(): void {
      void store.pop().then(([found, count]) => {
        if (found) {
          // We have pending plus just found
          queueLengthChanged(count + 1);
          void send(found);
        } else {
          queueLengthChanged(0);
        }
      });
    }

    // eslint-disable-next-line @sentry-internal/sdk/no-async-await
    async function send(request: Envelope): Promise<void | TransportMakeRequestResponse> {
      let action = (await options.beforeSend?.(request)) || 'send';

      if (action === 'send') {
        try {
          const result = await baseTransport.send(request);
          if (!wasRateLimited(result || {})) {
            // Reset the retry delay
            retryDelay = START_DELAY;
            // We were successful so check the queue
            flushQueue();
            return result;
          }
        } catch (_) {
          //
        }
        action = 'queue';
      }

      if (action == 'queue') {
        void queueRequest(request);
      }

      return {};
    }

    return {
      send,
      flush: (timeout?: number) => baseTransport.flush(timeout),
    };
  };
}
